// K17.5 – Server Actions pre registračný tok s pozývacím kódom.
//
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

const INVALID_CODE_MESSAGE = "Pozývací kód nie je platný.";

/**
 * verifyInvitationCodeAction – overí kód bez spotrebovania.
 */
export async function verifyInvitationCodeAction(code: string): Promise<VerifyCodeState> {
  const normalized = (code ?? "").trim();
  if (!normalized) {
    return { ok: false, message: "Zadajte pozývací kód." };
  }

  const verification = await verifyInvitationCode(normalized);
  if (!verification || !verification.is_valid) {
    // Neodhalujeme, či kód existoval, bol expirovaný alebo zrušený.
    return { ok: false, message: INVALID_CODE_MESSAGE };
  }

  return {
    ok: true,
    role: verification.role,
    roleLabel: ROLE_LABELS[verification.role] ?? verification.role,
    expiresAt: verification.expires_at,
  };
}

/**
 * acceptInvitationAction – atomicky uplatní kód a pridá rolu používateľovi.
 *
 * Vyžaduje existujúcu session (po vytvorení účtu a prihlásení).
 */
export async function acceptInvitationAction(code: string): Promise<AcceptInvitationState> {
  const normalized = (code ?? "").trim();
  if (!normalized) {
    return { ok: false, message: "Zadajte pozývací kód." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      message:
        "Na uplatnenie kódu musíte byť prihlásení. Potvrďte e-mail a prihláste sa, potom kód uplatníte.",
    };
  }

  const result = await claimInvitationCode(normalized, user.id, user.email ?? "");

  if (!result.success) {
    if (result.error === "code_unusable") {
      return {
        ok: false,
        message:
          "Tento pozývací kód už bol použitý, expiroval alebo bol zrušený. Otočte sa na administrátora.",
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
