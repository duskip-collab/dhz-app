// K17.5 – Serverová služba pre správu pozývacích kódov.
//
// BEZPEČNOSTNÉ ZÁSADY:
//  - Raw pozývací kód sa v DB ukladá IBA ako SHA-256 hash (`code_hash`).
//  - Raw kód sa vracia IBA raz – z `createInvitation()`.
//  - Kód sa NIKDY nevykresľuje do logov, auditu, URL ani localStorage.
//  - Rola sa odosiela ako KÓD (whitelist), nie ako role_id.
//  - Jednorazovosť a expiráciu vynucuje DB (RPC claim_invitation_code).
//  - `admin.users` je jediný zdroj pravdy pre oprávnenie (zhoda s RLS).

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isAppRole, type AppRole } from "@/lib/auth/roles";
import { createAuthError } from "@/lib/members/members.errors";
import {
  generateInvitationCode,
  hashInvitationCode,
} from "./invitations.share";
import {
  INVITATION_DEFAULT_MAX_USES,
  INVITATION_DEFAULT_VALIDITY_DAYS,
  INVITATION_MAX_USES_LIMIT,
  type CreateInvitationParams,
  type CreatedInvitation,
  type Invitation,
  type InvitationClaimResult,
  type InvitationStatus,
  type InvitationVerification,
} from "./invitations.types";

// =============================================================================
// VALIDÁCIA
// =============================================================================

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function assertRole(role: string): asserts role is AppRole {
  if (!isAppRole(role)) {
    throw createAuthError(400, "Neplatná rola.");
  }
}

function toInvitation(row: {
  id: string;
  role: string;
  status: string;
  use_count: number;
  max_uses: number;
  expires_at: string;
  target_email: string | null;
  member_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}): Invitation {
  assertRole(row.role);
  return {
    id: row.id,
    role: row.role,
    status: row.status as InvitationStatus,
    use_count: row.use_count,
    max_uses: row.max_uses,
    expires_at: row.expires_at,
    target_email: row.target_email,
    member_id: row.member_id,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
  };
}

// =============================================================================
// VYTVORENIE POZVÁNKY
// =============================================================================

/**
 * createInvitation – vytvorí pozývaciu pozvánku.
 *
 * Vyžaduje oprávnenie `admin.users` (fail-closed).
 * Vracia raw kód – IBA raz. Caller je povinný ho zobraziť a po zatvorení
 * dialógu odstrániť zo stavu.
 */
export async function createInvitation(
  params: CreateInvitationParams,
): Promise<CreatedInvitation> {
  await requirePermission(PERMISSIONS.ADMIN_USERS);
  assertRole(params.role);

  const maxUses = params.maxUses ?? INVITATION_DEFAULT_MAX_USES;
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > INVITATION_MAX_USES_LIMIT) {
    throw createAuthError(400, "Neplatný počet povolených použití kódu.");
  }

  const validDays = params.validDays ?? INVITATION_DEFAULT_VALIDITY_DAYS;
  if (!Number.isFinite(validDays) || validDays <= 0 || validDays > 365) {
    throw createAuthError(400, "Neplatná dĺžka platnosti kódu.");
  }

  let targetEmail: string | null = null;
  if (params.targetEmail && params.targetEmail.trim()) {
    targetEmail = params.targetEmail.trim().toLowerCase();
    if (!isValidEmail(targetEmail)) {
      throw createAuthError(400, "Neplatná e-mailová adresa.");
    }
  }

  const code = generateInvitationCode();
  const codeHash = await hashInvitationCode(code);
  const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invitation" as never, {
    p_role_code: params.role,
    p_code_hash: codeHash,
    p_expires_at: expiresAt.toISOString(),
    p_target_email: targetEmail,
    p_member_id: params.memberId ?? null,
    p_max_uses: maxUses,
    p_notes: params.notes ?? null,
  } as never);

  if (error) {
    // Chyba sa NEVYKRESĽUJE s detailom kódu.
    console.error("[createInvitation] RPC error:", error.message);
    throw createAuthError(500, "Pozvánku sa nepodarilo vytvoriť.");
  }

  const invitationId = typeof data === "string" ? data : null;
  if (!invitationId) {
    throw createAuthError(500, "Pozvánku sa nepodarilo vytvoriť.");
  }

  const invitation = await getInvitationById(invitationId);
  if (!invitation) {
    throw createAuthError(500, "Pozvánku sa nepodarilo načítať.");
  }

  return { invitation, code, codeHash };
}

// =============================================================================
// ČÍTANIE
// =============================================================================

/**
 * listInvitations – zoznam pozvánok pre admina.
 * Vracia sanitizované údaje (bez `code_hash`).
 */
export async function listInvitations(
  limit = 100,
  offset = 0,
): Promise<Invitation[]> {
  await requirePermission(PERMISSIONS.ADMIN_USERS);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_invitations" as never, {
    p_limit: limit,
    p_offset: offset,
  } as never);

  if (error) {
    console.error("[listInvitations] RPC error:", error.message);
    throw createAuthError(500, "Pozvánky sa nepodarilo načítať.");
  }

  const rows = (data ?? []) as Array<Parameters<typeof toInvitation>[0]>;
  return rows.map(toInvitation);
}

/**
 * getInvitationById – načíta jednu pozvánku (bez `code_hash`).
 */
export async function getInvitationById(id: string): Promise<Invitation | null> {
  await requirePermission(PERMISSIONS.ADMIN_USERS);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select(
      "id, role, status, use_count, max_uses, expires_at, target_email, member_id, notes, created_at, updated_at, created_by",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[getInvitationById] query error:", error.message);
    throw createAuthError(500, "Pozvánku sa nepodarilo načítať.");
  }

  if (!data) return null;
  return toInvitation(data as Parameters<typeof toInvitation>[0]);
}

// =============================================================================
// ZRUŠENIE
// =============================================================================

/**
 * revokeInvitation – zruší pozvánku (soft delete: status='revoked').
 * DELETE je zámerne nedostupné (auditácia).
 */
export async function revokeInvitation(invitationId: string): Promise<void> {
  await requirePermission(PERMISSIONS.ADMIN_USERS);

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation" as never, {
    p_invitation_id: invitationId,
  } as never);

  if (error) {
    console.error("[revokeInvitation] RPC error:", error.message);
    throw createAuthError(500, "Pozvánku sa nepodarilo zrušiť.");
  }
}

// =============================================================================
// OVERENIE A UPLATNENIE (REGISTRAČNÝ TOK)
// =============================================================================

/**
 * verifyInvitationCode – overí kód BEZ spotrebovania.
 * Použiteľné v registračnom formulári pred potvrdením e-mailu.
 */
export async function verifyInvitationCode(
  code: string,
): Promise<InvitationVerification | null> {
  const normalized = code.trim();
  if (!normalized) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_invitation_code" as never, {
    p_code: normalized,
  } as never);

  if (error) {
    console.error("[verifyInvitationCode] RPC error:", error.message);
    return null;
  }

  const rows = (data ?? []) as Array<{
    invitation_id: string;
    role: string;
    status: string;
    is_valid: boolean;
    expires_at: string;
    use_count: number;
    max_uses: number;
  }>;

  const row = rows[0];
  if (!row) return null;

  return {
    invitation_id: row.invitation_id,
    role: row.role as AppRole,
    status: row.status as InvitationStatus,
    is_valid: row.is_valid,
    expires_at: row.expires_at,
    use_count: row.use_count,
    max_uses: row.max_uses,
  };
}

/**
 * claimInvitationCode – atomicky uplatní kód a pridá rolu používateľovi.
 *
 * Jednorazovosť je vynútená databázou; pri súbežných požiadavkách vyhrá
 * iba jeden. Rola pochádza IBA z pozvánky.
 *
 * BEZPEČNOSŤ: používateľ sa identifikuje VYLUČNE zo serverovej session
 * (`auth.getUser()`). `userId` z argumentu je iba núdzový zdroj pre
 * service_role integráciu – pri bežnom toku sa použije session id a RPC
 * overí, že `p_user_id` sedí s `auth.uid()`.
 */
export async function claimInvitationCode(
  code: string,
  userId: string,
  email: string,
): Promise<InvitationClaimResult> {
  const normalized = code.trim();
  if (!normalized || !userId) {
    return { success: false, error: "invalid_code" };
  }

  const supabase = await createClient();

  // Používateľ MUSÍ byť prihlásený – id sa načíta zo serverovej session.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "unknown" };
  }

  const effectiveUserId = user.id;
  const effectiveEmail = user.email ?? email;

  const { data, error } = await supabase.rpc("claim_invitation_code" as never, {
    p_code: normalized,
    p_user_id: effectiveUserId,
    p_email: effectiveEmail.trim().toLowerCase(),
  } as never);

  if (error) {
    // Chyba sa NEVYKRESĽUJE s detailom kódu.
    console.error("[claimInvitationCode] RPC error:", error.message);
    return { success: false, error: "unknown" };
  }

  const result = (data ?? null) as {
    success?: boolean;
    invitation_id?: string;
    role?: string;
    error?: string;
  } | null;

  if (!result || result.success !== true) {
    return { success: false, error: (result?.error as "invalid_code") ?? "invalid_code" };
  }

  return {
    success: true,
    invitation_id: result.invitation_id,
    role: result.role as AppRole | undefined,
  };
}
