// K17.5 – Server Actions pre registračný tok s pozývacím kódom.
// BEZPEČNOSŤ:
//  - Overenie kódu je bez spotrebovania (anon RPC verify_invitation_code).
//  - Uplatnenie kódu vyžaduje prihláseného používateľa – server používa
//    session z cookies, nie id z klienta.
//  - Rola sa berie IBA z pozvánky; klient žiadnu rolu neposiela.

"use server";

import { createClient } from "@/lib/supabase/server";
import { claimInvitationCode, verifyInvitationCode } from "@/lib/auth/invitations.service";
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

  const result = await claimInvitationCode(normalized);

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
 * 3. Uplatní pozývací kód cez aktuálnu autentifikovanú session
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

  if (!authData.session) {
    return {
      success: false,
      message: "Účet bol vytvorený. Prihláste sa doň a potom uplatnite pozývací kód.",
    };
  }

  // Krok 3: Uplatnenie pozvánky iba cez identitu aktuálnej serverovej session.
  const claimResult = await claimInvitationCode(normalized);

  if (!claimResult.success || !claimResult.role) {
    if (claimResult.error === "code_unusable") {
      return { success: false, message: "Tento pozývací kód už bol použitý." };
    }
    if (claimResult.error === "invalid_code") {
      return { success: false, message: "Pozývací kód nie je platný." };
    }
    return {
      success: false,
      message: "Účet bol vytvorený, ale pozvánku sa nepodarilo uplatniť. Prihláste sa a skúste to znova.",
    };
  }

  const role = claimResult.role;
  const roleLabel = ROLE_LABELS[role] ?? role;

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
