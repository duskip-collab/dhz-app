// K17.5 – Server Actions pre registračný tok s pozývacím kódom.
// BEZPEČNOSŤ:
//  - Overenie kódu je bez spotrebovania (anon RPC verify_invitation_code).
//  - Uplatnenie kódu vyžaduje prihláseného používateľa – server používa
//    session z cookies, nie id z klienta.
//  - Rola sa berie IBA z pozvánky; klient žiadnu rolu neposiela.

"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@/lib/supabase/server";
import { claimInvitationCodeForRegistration, verifyInvitationCode } from "@/lib/auth/invitations.service";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";

export type VerifyCodeState =
  | { ok: true; role: AppRole; roleLabel: string; expiresAt: string }
  | { ok: false; message: string };

export type AcceptInvitationState =
  | { ok: true; message: string; roleLabel?: string }
  | { ok: false; message: string };

export type RegisterWithInvitationResult =
  | { success: true; user: { id: string; email: string }; role: AppRole; roleLabel: string; redirectTo: string }
  | { success: false; message: string };

const INVALID_CODE_MESSAGE = "Pozývací kód nie je platný.";

export async function verifyInvitationCodeAction(code: string): Promise<VerifyCodeState> {
  const normalized = (code ?? "").trim();
  if (!normalized) {
    return { ok: false, message: "Zadajte pozývací kód." };
  }

  const verification = await verifyInvitationCode(normalized);
  if (!verification || !verification.is_valid) {
    return { ok: false, message: INVALID_CODE_MESSAGE };
  }

  return {
    ok: true,
    role: verification.role,
    roleLabel: ROLE_LABELS[verification.role] ?? verification.role,
    expiresAt: verification.expires_at,
  };
}

export async function acceptInvitationAction(code: string): Promise<AcceptInvitationState> {
  const normalized = (code ?? "").trim();
  if (!normalized) {
    return { ok: false, message: "Zadajte pozývací kód." };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      message: "Na uplatnenie kódu musíte byť prihlásený. Potvrďte e-mail a prihláste sa, potom kód uplatníte.",
    };
  }

  const result = await claimInvitationCode(normalized, user.id, user.email ?? "");

  if (!result.success) {
    if (result.error === "code_unusable") {
      return {
        ok: false,
        message: "Tento pozývací kód už bol použitý, expiroval alebo bol zrušený. Otočte sa na administrátora.",
      };
    }
    return { ok: false, message: INVALID_CODE_MESSAGE };
  }

  return {
    ok: true,
    message: "Registrácia bola dokončená – rola bola priradená.",
    roleLabel: result.role ? (ROLE_LABELS[result.role] ?? result.role) : undefined,
  };
}

/**
 * K19 – Registrácia s pozývacím kódom bez predchádzajúceho prihlasenia.
 *
 * Tohoho toku:
 * 1. Overí pozývací kód (bez spotrebovania)
 * 2. Vytvorí používateľa v Supabase Auth
 * 3. Nastaví email_confirmed_at na serveri (pomocou service_role)
 * 4. Uplní pozývací kód (priradi rolu, vytvorí audit záznamov)
 * 5. Používateľ je automaticky prihlásený via Supabase session
 *
 * @param code - Pozývací kód z registračného formulára
 * @param email - E-mailová adresa používateľa
 * @param password - Heslo používateľa
 * @returns Výsledok registrácie s informáciou o smerovaní
 */
export async function registerWithInvitationCodeAction(
  code: string,
  email: string,
  password: string,
): Promise<RegisterWithInvitationResult> {
  // Krok 1: Overenie pozývacieho kódu (bez spotrebovania)
  const normalized = (code ?? "").trim();
  if (!normalized) {
    return { success: false, message: "Zadajte pozývací kód." };
  }

  const verification = await verifyInvitationCode(normalized);
  if (!verification || !verification.is_valid) {
    return { success: false, message: "Pozývací kód nie je platný." };
  }

  const role = verification.role;
  const roleLabel = ROLE_LABELS[role] ?? role;

  // Krok 2: Vytvorenie používateľa v Supabase Auth
  const supabase = await createClient();
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    console.error("[registerWithInvitationCodeAction] signUp error:", signUpError);
    return { success: false, message: "Chyba pri vytváraní používateľa. Skúste to znova." };
  }

  const newUserId = authData.user?.id;
  if (!newUserId) {
    return { success: false, message: "Nepodarilo sa získať ID používateľa." };
  }

  // Krok 3: Nastaviť email_confirmed_at na serveri pomocou service_role
  try {
    const serviceSupabase = await createClient(true);
    const { error: updateError } = await serviceSupabase
      .from("auth.users")
      .update({ email_confirmed_at: new Date().toISOString() })
      .eq("id", newUserId);
    if (updateError) {
      console.error("[registerWithInvitationCodeAction] update email_confirmed_at error:", updateError);
    }
  } catch (err) {
    console.error("[registerWithInvitationCodeAction] service client error:", err);
  }

  // Krok 4: Uplníme pozývací kód
  // K19: Použiame registration-specific claim funkciu, ktora nepouziva auth.getUser()
  const claimResult = await claimInvitationCodeForRegistration(normalized, newUserId, email);

  if (!claimResult.success) {
    try {
      await supabase.auth.admin.deleteUser(newUserId);
    } catch (deleteError) {
      console.error("[registerWithInvitationCodeAction] delete user error:", deleteError);
    }
    if (claimResult.error !== "code_unusable") {
      return { success: false, message: "Chyba pri uplatňovaní kódu. Skúste to znova." };
    }
    return { success: false, message: "Tento pozývací kód už bol použitý." };
  }

  return {
    success: true,
    user: {
      id: newUserId,
      email: authData.user?.email ?? email,
    },
    role: role,
    roleLabel: roleLabel,
    redirectTo: "/",
  };
}

/**
 * K19 – Registrácia s pozývacím kódom bez predchádzajúceho prihlasenia.
 */
export async function registerWithInvitationCodeAction(
