"use server";

import { revalidatePath } from "next/cache";
import {
  setUserRole,
  toggleUserPermission,
  generateMemberAccessCode,
  generateMemberAccessCodeForMember,
  revokeMemberAccessForMember,
  getMemberInvitationStatus,
  loadMemberAccessDetail,
  saveMemberAccess,
  generateActivationCode,
  revokeActivationCode,
  listActivationCodesForMember,
} from "@/lib/admin/admin.service";
import { isPermission, PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/server";
import { isAppRole, type AppRole } from "@/lib/auth/roles";

type AdminActionState =
  | {
      ok: true;
      message?: string;
      data?: unknown;
    }
  | { ok: false; errors?: Record<string, string>; message: string };

function fail(message: string, errors: Record<string, string> = {}): AdminActionState {
  return { ok: false, errors, message };
}

function statusMessage(e: unknown, fallback: string): string {
  const status = (e as { statusCode?: number }).statusCode ?? 500;
  if (status === 403) return "Nemáte oprávnenie na túto akciu.";
  if (status === 404) return "Používateľ sa nenašiel.";
  return e instanceof Error && e.message ? e.message : fallback;
}

function parsePermissions(raw: string): Permission[] | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || !value.every(
    (permission): permission is Permission =>
      typeof permission === "string" && isPermission(permission),
  )) {
    return null;
  }
  return value;
}

/**
 * ensureAdminGate – overí, že volajúci je ADMIN alebo VELITEL.
 */
async function ensureAdminGate(): Promise<void> {
  const ctx = await getAuthContext();
  const isAdminOrVelitel =
    ctx.roles.includes("ADMIN") || ctx.roles.includes("VELITEL") ||
    ctx.permissions.includes(PERMISSIONS.ADMIN_USERS) ||
    ctx.permissions.includes(PERMISSIONS.ADMIN_PERMISSIONS);
  if (!isAdminOrVelitel) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
}

/**
 * setUserRoleAction – nastaví rolu používateľa.
 */
export async function setUserRoleAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const userId = String(formData.get("user_id") ?? "").trim();
  const roleCode = String(formData.get("role_code") ?? "").trim();
  if (!userId || !roleCode) {
    return fail("Chýbajú povinné údaje.");
  }

  try {
    await ensureAdminGate();
    if (!isAppRole(roleCode)) {
      return fail("Neplatný kód role.");
    }
    await setUserRole(userId, roleCode);
    revalidatePath("/admin");
    return { ok: true, message: "Rola bola uložená." };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri nastavovaní role."));
  }
}

/**
 * toggleUserPermissionAction – zapne/vypne oprávnenie pre používateľa.
 */
export async function toggleUserPermissionAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const userId = String(formData.get("user_id") ?? "").trim();
  const permissionCode = String(formData.get("permission_code") ?? "").trim();
  const enabled = formData.get("enabled") === "true";
  if (!userId || !permissionCode) {
    return fail("Chýbajú povinné údaje.");
  }

  try {
    await ensureAdminGate();
    await toggleUserPermission(userId, permissionCode, enabled);
    revalidatePath("/admin");
    return { ok: true, message: "Oprávnenie bolo aktualizované." };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri úprave oprávnenia."));
  }
}

/**
 * generateMemberAccessCodeAction – vygeneruje prístupový kód pre člena.
 */
export async function generateMemberAccessCodeAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const userId = String(formData.get("user_id") ?? "").trim();
  if (!userId) {
    return fail("Chýba identifikátor používateľa.");
  }

  try {
    await ensureAdminGate();
    const code = await generateMemberAccessCode(userId);
    revalidatePath("/admin");
    return { ok: true, message: `Prístupový kód: ${code}` };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri generovaní prístupového kódu."));
  }
}

/**
 * generateMemberAccessCodeForMemberAction – vygeneruje pozývací kód pre člena
 * viazaný na member_id (nie user_id). Funguje aj pre členov bez účtu.
 */
export async function generateMemberAccessCodeForMemberAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const memberId = String(formData.get("member_id") ?? "").trim();
  const roleCode = String(formData.get("role_code") ?? "").trim();
  if (!memberId || !roleCode) {
    return fail("Chýba identifikátor člena alebo kód role.");
  }

  try {
    await ensureAdminGate();
    if (!isAppRole(roleCode)) {
      return fail("Neplatný kód role.");
    }
    const result = await generateMemberAccessCodeForMember(memberId, roleCode);
    revalidatePath("/admin");
    return {
      ok: true,
      message:
        result.kind === "login"
          ? "Prihlasovací kód bol vygenerovaný."
          : "Registračný pozývací kód bol vygenerovaný.",
      data: result,
    };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri generovaní prístupového kódu."));
  }
}

/**
 * revokeMemberAccessCodeAction – zruší aktívnu pozvánku pre člena.
 */
export async function revokeMemberAccessCodeAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) {
    return fail("Chýba identifikátor člena.");
  }

  try {
    await ensureAdminGate();
    await revokeMemberAccessForMember(memberId);
    revalidatePath("/admin");
    return { ok: true, message: "Prístupový kód bol zrušený." };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri rušení prístupového kódu."));
  }
}

/**
 * getMemberInvitationStatusAction – vráti stav prístupu člena.
 */
export async function getMemberInvitationStatusAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState & { data?: unknown }> {
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) {
    return fail("Chýba identifikátor člena.");
  }

  try {
    await ensureAdminGate();
    const status = await getMemberInvitationStatus(memberId);
    revalidatePath("/admin");
    return { ok: true, message: "Stav prístupu načítaný.", data: status };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri načítaní stavu prístupu."));
  }
}

/**
 * loadMemberAccessDetailAction – vráti detail prístupu člena (rola, oprávnenia, kódy).
 */
export async function loadMemberAccessDetailAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState & { data?: unknown }> {
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) {
    return fail("Chýba identifikátor člena.");
  }

  try {
    await ensureAdminGate();
    const detail = await loadMemberAccessDetail(memberId);
    return { ok: true, message: "Detail prístupu načítaný.", data: detail };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri načítaní detailu prístupu."));
  }
}

/**
 * saveMemberAccessAction – uloží rolu a individuálne oprávnenia člena (atomicky).
 * FormData: member_id, role_code, grant_permissions (JSON), deny_permissions (JSON)
 */
export async function saveMemberAccessAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const memberId = String(formData.get("member_id") ?? "").trim();
  const roleCode = String(formData.get("role_code") ?? "").trim();
  const grantRaw = String(formData.get("grant_permissions") ?? "[]").trim();
  const denyRaw = String(formData.get("deny_permissions") ?? "[]").trim();

  if (!memberId || !roleCode) {
    return fail("Chýbajú povinné údaje.");
  }
  if (!isAppRole(roleCode)) {
    return fail("Neplatný kód role.");
  }

  const grantPermissions = parsePermissions(grantRaw);
  const denyPermissions = parsePermissions(denyRaw);
  if (!grantPermissions || !denyPermissions) {
    return fail("Neplatný zoznam oprávnení.");
  }

  try {
    await ensureAdminGate();
    await saveMemberAccess(memberId, {
      roleCode: roleCode as AppRole,
      grantPermissions,
      denyPermissions,
    });
    revalidatePath("/admin");
    return { ok: true, message: "Prístupy boli uložené." };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri ukladaní prístupov."));
  }
}

/**
 * generateActivationCodeAction – vygeneruje aktivačný kód pre člena.
 * FormData: member_id, role_code, permissions (JSON), validity_days, max_uses
 */
export async function generateActivationCodeAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const memberId = String(formData.get("member_id") ?? "").trim();
  const roleCode = String(formData.get("role_code") ?? "").trim();
  const permRaw = String(formData.get("permissions") ?? "[]").trim();
  const validityDaysRaw = String(formData.get("validity_days") ?? "14").trim();
  const maxUsesRaw = String(formData.get("max_uses") ?? "1").trim();

  if (!memberId || !roleCode) {
    return fail("Chýbajú povinné údaje.");
  }
  if (!isAppRole(roleCode)) {
    return fail("Neplatný kód role.");
  }

  let permissions: Permission[] | null;
  const validityDays = Number.parseInt(validityDaysRaw, 10);
  const maxUses = Number.parseInt(maxUsesRaw, 10);
  try {
    permissions = parsePermissions(permRaw);
  } catch {
    return fail("Neplatné parametre kódu.");
  }
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 365) {
    return fail("Neplatná platnosť kódu (1 – 365 dní).");
  }
  if (!permissions) {
    return fail("Neplatný zoznam oprávnení.");
  }
  if (maxUses !== 1) {
    return fail("Aktivačný kód musí byť jednorazový.");
  }

  try {
    await ensureAdminGate();
    const result = await generateActivationCode({
      memberId,
      roleCode: roleCode as AppRole,
      permissions,
      validityDays,
      maxUses,
    });
    revalidatePath("/admin");
    return {
      ok: true,
      message: "Aktivačný kód bol vygenerovaný.",
      data: { code: result.code, invitationId: result.invitationId, expiresAt: result.expiresAt },
    };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri generovaní aktivačného kódu."));
  }
}

/**
 * revokeActivationCodeAction – zruší aktívny aktivačný kód člena.
 * FormData: member_id
 */
export async function revokeActivationCodeAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) {
    return fail("Chýba identifikátor člena.");
  }

  try {
    await ensureAdminGate();
    await revokeActivationCode(memberId);
    revalidatePath("/admin");
    return { ok: true, message: "Aktivačný kód bol zrušený." };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri rušení aktivačného kódu."));
  }
}

/**
 * listActivationCodesForMemberAction – zoznam kódov člena.
 */
export async function listActivationCodesForMemberAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState & { data?: unknown }> {
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) {
    return fail("Chýba identifikátor člena.");
  }

  try {
    await ensureAdminGate();
    const codes = await listActivationCodesForMember(memberId);
    return { ok: true, message: "Kódy načítané.", data: codes };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri načítaní aktivačných kódov."));
  }
}