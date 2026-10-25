"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  setUserRole,
  toggleUserPermission,
  generateMemberAccessCode,
  type AdminMemberRow,
} from "@/lib/admin/admin.service";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/server";
import { isAppRole } from "@/lib/auth/roles";

type AdminActionState =
  | { ok: true; message?: string }
  | { ok: false; errors: Record<string, string>; message: string };

function fail(message: string, errors: Record<string, string> = {}): AdminActionState {
  return { ok: false, errors, message };
}

function statusMessage(e: unknown, fallback: string): string {
  const status = (e as { statusCode?: number }).statusCode ?? 500;
  if (status === 403) return "Nemáte oprávnenie na túto akciu.";
  if (status === 404) return "Používateľ sa nenašiel.";
  return e instanceof Error && e.message ? e.message : fallback;
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