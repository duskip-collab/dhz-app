"use server";

import { createClient } from "@/lib/supabase/server";

export type LoginCheckResult = { ok: true } | { ok: false; message: string };

/**
 * checkEmailLoginAllowed – pravidlo prihlasovania e-mailom (server action,
 * bez nutnosti session; volá anon RPC is_email_login_allowed).
 *
 * Povolené:
 *  - hlavný administrátor (rola ADMIN v user_roles),
 *  - člen, ktorý má tento e-mail explicitne zadaný v členskom profile.
 * Inak sa e-mailové prihlásenie odmietne – člen použije prístupový kód.
 */
export async function checkEmailLoginAllowed(email: string): Promise<LoginCheckResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return { ok: false, message: "Zadajte platnú e-mailovú adresu." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_email_login_allowed" as never, {
    p_email: normalized,
  } as never);

  if (error) {
    console.error("[checkEmailLoginAllowed] RPC error:", error);
    return { ok: false, message: "Overenie prihlásenia zlyhalo. Skúste to znova." };
  }

  if (data !== true) {
    return {
      ok: false,
      message:
        "E-mailové prihlásenie nie je pre tento účet povolené. Prístup e-mailom majú hlavný administrátor a členovia s e-mailom zadaným v členskom profile. Použite vygenerovaný prístupový kód – obráťte sa na administrátora alebo veliteľa.",
    };
  }

  return { ok: true };
}

/**
 * resolveAccessCodeEmail – prístupový kód → e-mail účtu (server action).
 * Volá anon RPC resolve_access_code.
 */
export async function resolveAccessCodeEmail(
  code: string
): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  const normalized = code.trim();
  if (normalized.length < 6) {
    return { ok: false, message: "Neplatný prístupový kód." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_access_code" as never, {
    p_code: normalized,
  } as never);

  if (error) {
    console.error("[resolveAccessCodeEmail] RPC error:", error);
    return { ok: false, message: "Overenie kódu zlyhalo. Skúste to znova." };
  }

  const email = typeof data === "string" ? data : null;
  if (!email) {
    return { ok: false, message: "Neplatný prístupový kód." };
  }

  return { ok: true, email };
}
