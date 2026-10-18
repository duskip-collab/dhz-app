// Web Push hook (K13.4.2) — registrácia odberu notifikácií viazaná na
// prihláseného používateľa.
//
// BEZPEČNOSŤ:
//   * Subscription sa ukladá do `push_subscriptions` s `user_id = auth.uid()`
//     (navrhovaná RLS: INSERT/UPDATE/DELETE len pre vlastné riadky).
//   * VAPID súkromný kľúč je VÝHRADNE na serveri (Edge Function env);
//     klient pozná len `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
//   * Bez povolenia (`denied`) sa nič neukladá; bez SW sa nič neregistruje.
//
// IDEMPOTENTNÝ FALLBACK (schéma ešte neexistuje):
//   Tabuľka `push_subscriptions` zatiaľ NIE JE v `database.types.ts` ani
//   v migráciách (overené K13.4.2). Hook sa preto nikdy nerozbije:
//   pokus o upsert sa encapsuluje v `persistSubscription()`; pri chybe
//   (tabuľka neexistuje / RLS zamietol) zostane odber LOKÁLNY
//   (`granted-local`) a používateľ vidí varovanie — server takýto odber
//   nevie adresovať, kým migrácia (návrh v K13.4.2 reporte) nepríde.

"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { base64UrlToUint8Array } from "./push-utils";

/** Stav push odberu pre UI. */
export type PushStatus =
  | "loading"          // úvodná kontrola
  | "unsupported"      // prehliadač nemá Service Worker / Push API
  | "default"          // povolenie ešte neudelené
  | "not-configured"   // chýba NEXT_PUBLIC_VAPID_PUBLIC_KEY
  | "denied"           // používateľ zamietol povolenie
  | "granted-local"    // povolené + odber aktívny, ale NIE je v DB (fallback)
  | "granted-saved";   // povolené + odber aktívny a uložený v DB

/** VAPID verejný kľúč z env (inlinovaný Next buildom; žiadne tajomstvo). */
function vapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return typeof key === "string" && key.length > 0 ? key : null;
}

/** Čistá kontrola podpory (mimo React). */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * Uloží/aktualizuje subscription pre aktuálneho používateľa (idempotentné
 * cez `onConflict: "endpoint"`). `user_id` sa berie z RLS kontextu relácie —
 * klient ho nikdy neposiela ako spoof.
 */
async function persistSubscription(sub: PushSubscription): Promise<boolean> {
  const key = sub.getKey("p256dh");
  const authSecret = sub.getKey("auth");
  if (!key || !authSecret) {
    return false;
  }
  const toB64Url = (buf: ArrayBuffer): string => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const supabase = createClient() as unknown as SupabaseClient;
  try {
    // `user_id` sa doplní z JWT relácie (RLS navrhnutá ako
    // `user_id = auth.uid()`); endpoint je unikátny kľúč.
    // POZN.: loose typ `SupabaseClient` — tabuľka `push_subscriptions`
    // zatiaľ nie je v `database.types.ts` (K13.4.2 návrh migrácie).
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        endpoint: sub.endpoint,
        p256dh: toB64Url(key),
        auth: toB64Url(authSecret),
      },
      { onConflict: "endpoint" },
    );
    if (error) {
      console.warn("[push] uloženie subscription zlyhalo (tabuľka chýba?):", error.code ?? error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[push] uloženie subscription zlyhalo:", err);
    return false;
  }
}

/** Best-effort vymazanie subscription zo servera (tiché pri chybe). */
async function deletePersistedSubscription(endpoint: string): Promise<void> {
  const supabase = createClient() as unknown as SupabaseClient;
  try {
    // POZN.: loose typ `SupabaseClient` — viz. persistSubscription().
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    // Tabuľka neexistuje alebo RLS zamietol — odber sa ruší lokálne aj tak.
  }
}

/**
 * Hook pre Web Push odber.
 *
 * `subscribe()` — vyžiada povolenie, prihlási odber pod VAPID kľúčom a
 * idempotentne ho uloží do `push_subscriptions` (fallback: lokálny odber).
 * `unsubscribe()` — zruší odber v prehliadači aj na serveri (best-effort).
 * `refresh()` — zosynchronizuje stav s aktuálnym odberom v prehliadači.
 */
export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState<boolean>(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!existing) {
        const permission = Notification.permission;
        setStatus(permission === "denied" ? "denied" : "default");
        return;
      }
      // Odber existuje — skús ho idempotentne zosynchronizovať s DB.
      const saved = await persistSubscription(existing);
      setStatus(saved ? "granted-saved" : "granted-local");
    } catch {
      setStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    // RAF deferral — rovnaký vzor ako useSWController (mimo synchronického
    // effect body; refresh je async a setState volá až po await).
    const frame = requestAnimationFrame(() => {
      void refresh();
    });
    return () => cancelAnimationFrame(frame);
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<PushStatus> => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return "unsupported";
    }
    const vapidKey = vapidPublicKey();
    if (!vapidKey) {
      setStatus("not-configured");
      return "not-configured";
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setStatus("denied");
        return "denied";
      }
      if (permission !== "granted") {
        setStatus("default");
        return "default";
      }
      const registration = await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          // BufferSource cast: TS 5.7+ generic Uint8Array vs. DOM BufferSource.
          applicationServerKey: base64UrlToUint8Array(
            vapidKey,
          ) as unknown as BufferSource,
        });
      }
      const saved = await persistSubscription(sub);
      setStatus(saved ? "granted-saved" : "granted-local");
      return saved ? "granted-saved" : "granted-local";
    } catch (err) {
      console.warn("[push] subscribe zlyhal:", err);
      setStatus("default");
      return "default";
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isPushSupported()) {
      return;
    }
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await deletePersistedSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("default");
    } catch (err) {
      console.warn("[push] unsubscribe zlyhal:", err);
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, subscribe, unsubscribe, refresh };
}

