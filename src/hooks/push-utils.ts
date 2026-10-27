// Push notification utilities (K13.4.2) — čisté funkcie bez IO.
// Používajú ich hook `usePushNotifications` aj SW payload parser.
// Bez závislostí na React/Supabase → unit-testovateľné cez node:test.

/** Bezpečne skonvertuje base64url VAPID verejný kľúč na Uint8Array. */
export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Normalizovaný payload push notifikácie (JSON z Edge Function / cronu). */
export interface PushPayload {
  title: string;
  body: string;
  /** Cieľová route po kliknutí (napr. `/vehicles/[id]`); `null` = hlavná stránka. */
  url: string | null;
  /** Voliteľná cesta k ikone (napr. `/icons/icon-192.png`). */
  icon: string | null;
  /** Tag na zlúčenie rovnakých notifikácií. */
  tag: string | null;
}

/**
 * Parsuje JSON push payload. Neplatný/chýbajúci vstup nikdy nehodí —
 * vráti bezpečný fallback (prázdny title, hlavná route). URL musí byť
 * RELATÍVNA (začína `/`) — inak sa odhodí (ochrana pred open redirect
 * cez notifikáciu).
 */
export function parsePushPayload(raw: string | null | undefined): PushPayload {
  const fallback: PushPayload = {
    title: "DHZ Ružindol",
    body: "",
    url: null,
    icon: null,
    tag: null,
  };
  if (!raw) {
    return fallback;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof data !== "object" || data === null) {
    return fallback;
  }
  const obj = data as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const safeUrl = (v: unknown): string | null => {
    const s = str(v);
    // Iba relatívne cesty — žiadne absolute URL (open-redirect prevencia).
    return s !== null && s.startsWith("/") && !s.startsWith("//") ? s : null;
  };
  return {
    title: str(obj.title) ?? fallback.title,
    body: str(obj.body) ?? "",
    url: safeUrl(obj.url),
    icon: safeUrl(obj.icon),
    tag: str(obj.tag),
  };
}
