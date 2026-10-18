// Edge Function: send-push (K13.4.2)
// ============================================================================
// Odoslanie Web Push notifikácie oprávnenému odosielateľovi.
//
// BEZPEČNOSŤ:
//   * Volajúci sa autentifikuje svojím Supabase JWT; oprávnenie
//     `communication.send` sa overí cez role_permissions/user_permissions
//     (existujúci permission kľúč — žiadne nové roly/kľúče).
//   * Cron/trigger cesta: `Authorization: Bearer <CRON_SECRET>` obíde
//     kontrolu oprávnenia IBA pri zhode s env `PUSH_CRON_SECRET`
//     ( chronologické spúšťače, nie používatelia).
//   * VAPID súkromný kľúč VÝHRADNE v env (`VAPID_PRIVATE_KEY`,
//     `VAPID_SUBJECT`); nikdy sa neloguje ani nevracia.
//   * Push subscriptions sa čítajú cez service client (RLS tabuľky je
//     navrhnutá pre používateľské zápisy; server ich číta ako dôveryhodný
//     kontext po overení oprávnenia odosielateľa).
//   * Payload: `url` musí byť relatívna cesta (open-redirect prevencia).
//
// DEPLOY: supabase functions deploy send-push
// ENV:    VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_CRON_SECRET (voliteľné)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.org";
const PUSH_CRON_SECRET = Deno.env.get("PUSH_CRON_SECRET") ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Iba relatívne cesty — rovnaké pravidlo ako v SW a push-utils. */
function isSafeRelativeUrl(u: unknown): u is string {
  return typeof u === "string" && u.startsWith("/") && !u.startsWith("//");
}

interface SendPushRequest {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  tag?: string;
  /** Cieľoví používatelia; bez zoznamu = broadcast všetkým odberateľom. */
  userIds?: string[];
}

/**
 * Overí, že JWT patrí používateľovi s oprávnením `communication.send`
 * (role_permissions aj user_permissions). Volá sa IBA s overeným userId.
 */
async function hasCommunicationSend(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .rpc("has_permission", { p_user_id: userId, p_permission_code: "communication.send" })
    .single();
  if (error) {
    console.error("[send-push] has_permission RPC error:", error.message);
    return false;
  }
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PRIVATE_KEY) {
    // Nikdy nevypisujeme hodnoty — len konštatovanie chýbajúcej konfigurácie.
    console.error("[send-push] chýba env konfigurácia (SUPABASE/SERVICE_ROLE/VAPID)");
    return json({ error: "Server not configured" }, 503);
  }

  // --- 1) Autorizácia odosielateľa -----------------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let senderId: string | null = null;
  if (PUSH_CRON_SECRET && token === PUSH_CRON_SECRET) {
    // Chronologický spúšťač (cron) — oprávnenie sa neoveruje, token je tajný.
    senderId = null;
  } else {
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    senderId = userData.user.id;
    const allowed = await hasCommunicationSend(supabaseAdmin, senderId);
    if (!allowed) {
      return json({ error: "Forbidden: communication.send required" }, 403);
    }
  }

  // --- 2) Validácia payloadu -----------------------------------------------
  let payload: SendPushRequest;
  try {
    payload = (await req.json()) as SendPushRequest;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof payload?.title !== "string" || payload.title.trim().length === 0) {
    return json({ error: "title is required" }, 400);
  }
  if (payload.url !== undefined && !isSafeRelativeUrl(payload.url)) {
    return json({ error: "url must be a relative path" }, 400);
  }
  if (payload.icon !== undefined && !isSafeRelativeUrl(payload.icon)) {
    return json({ error: "icon must be a relative path" }, 400);
  }

  // --- 3) Výber odberateľov ------------------------------------------------
  let query = supabaseAdmin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (Array.isArray(payload.userIds) && payload.userIds.length > 0) {
    query = query.in("user_id", payload.userIds);
  }
  const { data: subs, error: subsError } = await query;
  if (subsError) {
    // Tabuľka ešte neexistuje (K13.4.2 návrh migrácie) — nie je to pád servera.
    console.warn("[send-push] push_subscriptions nedostupné:", subsError.code ?? subsError.message);
    return json({ sent: 0, reason: "subscriptions table unavailable" }, 503);
  }

  // --- 4) Odoslanie cez Web Push -------------------------------------------
  webpush.setVapidDetails(VAPID_SUBJECT, Deno.env.get("VAPID_PUBLIC_KEY") ?? "", VAPID_PRIVATE_KEY);

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: isSafeRelativeUrl(payload.url) ? payload.url : null,
    icon: isSafeRelativeUrl(payload.icon) ? payload.icon : null,
    tag: typeof payload.tag === "string" ? payload.tag : null,
  });

  let sent = 0;
  let failed = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification,
      );
      sent += 1;
    } catch (err: { statusCode?: number } | unknown) {
      failed += 1;
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Zastaraný odber — odstrániť (idempotentné).
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("[send-push] send zlyhal (status:", statusCode, ")");
      }
    }
  }

  return json({ sent, failed, targets: (subs ?? []).length, by: senderId ?? "cron" });
});

