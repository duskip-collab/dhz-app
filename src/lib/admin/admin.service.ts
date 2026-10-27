import { createClient } from "@/lib/supabase/server";
import { createAuthError } from "@/lib/members/members.errors";
import { requireAuthenticated } from "../documents/org-documents.auth";
import { PERMISSIONS, VISIBILITY_PERMISSIONS } from "@/lib/auth/permissions";
import { APP_ROLES, type AppRole, ROLE_LABELS, isAppRole } from "@/lib/auth/roles";
import { logSecurityEvent, AUDIT_MODULES } from "@/lib/audit/audit.service";
import {
  createInvitation,
  revokeInvitation,
} from "@/lib/auth/invitations.service";

// =============================================================================
// Prehľad: členovia + roly + oprávnenia
// =============================================================================

export interface AdminMemberRow {
  member_id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  position: string | null;
  rank: string | null;
  email: string | null;
  status: string;
  auth_user_id: string | null;
  has_account: boolean;
  has_access_code: boolean;
}

export interface AdminUserRole {
  user_id: string;
  role_code: AppRole;
}

export interface AdminUserPermission {
  user_id: string;
  permission_code: string;
}

export function assertAdminGate(ctx: {
  roles: readonly string[];
  permissions: readonly string[];
}): void {
  const isAdminOrCommander =
    ctx.roles.includes(APP_ROLES.ADMIN) ||
    ctx.roles.includes(APP_ROLES.VELITEL) ||
    (ctx.permissions as readonly string[]).includes(PERMISSIONS.ADMIN_USERS) ||
    (ctx.permissions as readonly string[]).includes(PERMISSIONS.ADMIN_PERMISSIONS);
  if (!isAdminOrCommander) {
    throw createAuthError(403, "Nemáte oprávnenie na správu použítavitelia.");
  }
}

/**
 * loadAdminOverview – menný zoznam členov + mapovanie úloh/rolí/opravnení.
 * Brána: ADMIN alebo VELITEL (rola alebo admin.users / admin.permissions).
 */
export async function loadAdminOverview(): Promise<{
  members: AdminMemberRow[];
  userRoles: AdminUserRole[];
  userPermissions: AdminUserPermission[];
}> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();

  const { data: memberRows, error: membersError } = await supabase
    .from("members")
    .select(
      "id, member_number, first_name, last_name, position, rank, email, status, auth_user_id"
    )
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .limit(1000);
  if (membersError) {
    console.error("[loadAdminOverview] members error:", membersError);
    throw createAuthError(500, "Chyba pri načítavaní členov.");
  }

  const members = (memberRows ?? []) as Array<{
    id: string;
    member_number: string;
    first_name: string;
    last_name: string;
    position: string | null;
    rank: string | null;
    email: string | null;
    status: string;
    auth_user_id: string | null;
  }>;

  const userIds = members.map((m) => m.auth_user_id).filter((id): id is string => !!id);

  let userRoles: AdminUserRole[] = [];
  let userPermissions: AdminUserPermission[] = [];
  const codeHolders = new Set<string>();

  if (userIds.length > 0) {
    const [rolesRes, permsRes, codesRes] = await Promise.all([
      supabase
        .from("user_roles")
        .select("user_id, roles!user_roles_role_id_fkey(code)")
        .in("user_id", userIds),
      supabase
        .from("user_permissions")
        .select("user_id, permissions!user_permissions_permission_id_fkey(code)")
        .in("user_id", userIds),
      supabase.from("member_access_codes").select("user_id").in("user_id", userIds),
    ]);

    if (rolesRes.error) {
      console.error("[loadAdminOverview] roles error:", rolesRes.error);
    } else {
      userRoles = ((rolesRes.data ?? []) as Array<{
        user_id: string;
        roles: { code?: string } | null;
      }>)
        .map((r) => ({
          user_id: r.user_id,
          role_code: (r.roles?.code ?? "") as AppRole,
        }))
        .filter((r) => (Object.values(APP_ROLES) as string[]).includes(r.role_code));
    }

    if (permsRes.error) {
      console.error("[loadAdminOverview] permissions error:", permsRes.error);
    } else {
      userPermissions = ((permsRes.data ?? []) as Array<{
        user_id: string;
        permissions: { code?: string } | null;
      }>)
        .map((p) => ({
          user_id: p.user_id,
          permission_code: p.permissions?.code ?? "",
        }))
        .filter((p) => p.permission_code.length > 0);
    }

    if (!codesRes.error) {
      for (const c of ((codesRes.data ?? []) as Array<{ user_id: string }>)) {
        codeHolders.add(c.user_id);
      }
    }
  }

  return {
    members: members.map((m) => ({
      member_id: m.id,
      member_number: m.member_number,
      first_name: m.first_name,
      last_name: m.last_name,
      position: m.position,
      rank: m.rank,
      email: m.email,
      status: m.status,
      auth_user_id: m.auth_user_id,
      has_account: !!m.auth_user_id,
      has_access_code: m.auth_user_id ? codeHolders.has(m.auth_user_id) : false,
    })),
    userRoles,
    userPermissions,
  };
}

// =============================================================================
// ZOZNAMY PRE SELECTY
// =============================================================================

export interface CatalogRole {
  code: AppRole;
  label: string;
}

export async function listRoleCatalog(): Promise<CatalogRole[]> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").select("code").order("code");
  if (error) {
    throw createAuthError(500, "Chyba pri načítavaní rolí.");
  }
  return ((data ?? []) as Array<{ code: string }>).map((r) => ({
    code: r.code as AppRole,
    label: ROLE_LABELS[r.code as AppRole] ?? r.code,
  }));
}

export interface CatalogPermission {
  code: string;
  name: string;
}

export async function listPermissionCatalog(): Promise<CatalogPermission[]> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permissions")
    .select("code, name")
    .order("code");
  if (error) {
    console.error("[listPermissionCatalog] error:", error);
    throw createAuthError(500, "Chyba pri načítavaní oprávnení.");
  }
  return ((data ?? []) as Array<{ code: string; name: string }>)
    .filter((p) => (VISIBILITY_PERMISSIONS as readonly string[]).includes(p.code))
    .map((p) => ({ code: p.code, name: p.name }));
}

// ============================================================================
// SPRÁVA: roly, oprávnenia, prístupové kódy
// ============================================================================

/**
 * setUserRole – nastaví (jednu) rolu používateľa (user_roles).
 * RLS: ADMIN alebo VELITEL.
 */
export async function setUserRole(userId: string, roleCode: AppRole): Promise<void> {
  const ctx = await requireAuthenticated();
  // Citlivá mutácia: iba skutočný ADMIN (nie VELITEL ani všeobecná brána).
  if (!ctx.roles.includes(APP_ROLES.ADMIN) && !ctx.permissions.includes(PERMISSIONS.ADMIN_USERS)) {
    throw createAuthError(403, "Nemáte oprávnenie na zmenu rolí.");
  }
  if (!userId || !isAppRole(roleCode)) {
    throw createAuthError(400, "Neplatné vstupné údaje.");
  }
  if (userId === ctx.userId && roleCode === APP_ROLES.ADMIN) {
    throw createAuthError(403, "Self-escalation nie je povolená.");
  }
  if (roleCode === APP_ROLES.ADMIN) {
    throw createAuthError(403, "Pridelenie ADMIN vyžaduje samostatný schválený bootstrap.");
  }

  const supabase = await createClient();
  const roleId = await getRoleId(roleCode);

  // Výmena roly: odstrániť všetky existujúce roly používateľa, potom vložiť novú.
  const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
  if (delErr) throw createAuthError(500, "Chyba pri výmene role.");

  const { error } = await supabase.from("user_roles").insert({ user_id: userId, role_id: roleId });
  if (error) throw createAuthError(500, "Chyba pri nastavovaní role.");

  await logSecurityEvent({
    userId: ctx.userId,
    module: AUDIT_MODULES.USERS,
    action: "role.assign" as any,
    objectId: userId,
    data: { role_code: roleCode, target_user_id: userId },
  });
}

/**
 * toggleUserPermission – zapne/vypne oprávnenie u používateľa.
 */
export async function toggleUserPermission(
  userId: string,
  permissionCode: string,
  enabled: boolean
): Promise<void> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();
  const existing = await supabase
    .from("user_permissions")
    .select("id")
    .eq("user_id", userId)
    .eq("permission_id", (await getPermissionId(permissionCode)))
    .maybeSingle();

  if (existing.error) throw createAuthError(500, "Chyba pri úprave oprávnenia.");
  if (enabled && existing.data) {
    // už nastavené – nič
    return;
  }
  if (!enabled && existing.data) {
    const { error } = await supabase
      .from("user_permissions")
      .delete()
      .eq("id", existing.data.id);
    if (error) throw createAuthError(500, "Chyba pri odstránení oprávnenia.");
    return;
  }
  if (!enabled && !existing.data) {
    // nie je nastavené a chceme ho vypnúť – nič
    return;
  }
  // enabled && !existing.data → pridať
  const { error } = await supabase
    .from("user_permissions")
    .insert({
      user_id: userId,
      permission_id: (await getPermissionId(permissionCode)),
    });
  if (error) throw createAuthError(500, "Chyba pri nastavovaní oprávnenia.");
}

/**
 * generateMemberAccessCode – vygeneruje jedinečný prístupový kód pre člena
 * s existujúcim auth_user_id (kód sa stane heslom v auth.users).
 */
export async function generateMemberAccessCode(userId: string): Promise<string> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();
  const code = crypto.randomUUID().slice(-6).toUpperCase();
  const { data, error } = await supabase.rpc("set_member_access_code", {
    p_user_id: userId,
    p_code: code,
  });
  if (error) throw createAuthError(500, "Chyba pri generovaní prístupového kódu.");
  return (data as string) ?? code;
}

/**
 * generateMemberAccessCodeForMember – vygeneruje pozývací kód pre člena
 * bez ohľadu na to, či má už účet. Kód je viazaný na member_id.
 * Použije existujúci systém pozývacíх кодov (invitations).
 */
export async function generateMemberAccessCodeForMember(
  memberId: string,
  roleCode: AppRole,
): Promise<{ code: string; invitationId: string; expiresAt: string }> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);
  if (!isAppRole(roleCode)) {
    throw createAuthError(400, "Neplatný kód role.");
  }

  const created = await createInvitation({
    role: roleCode,
    memberId: memberId ?? null,
    maxUses: 1,
    validDays: 14,
    notes: "Prístupový kód pre člena (K16.0)",
  });

  await logSecurityEvent({
    userId: ctx.userId,
    module: AUDIT_MODULES.USERS,
    action: "invitation.create" as any,
    objectId: created.invitation.id,
    data: { member_id: memberId, role_code: roleCode },
  });

  return {
    code: created.code,
    invitationId: created.invitation.id,
    expiresAt: created.invitation.expires_at,
  };
}

/**
 * revokeMemberAccessForMember – zruší aktívnu pozvánku pre člena.
 */
export async function revokeMemberAccessForMember(memberId: string): Promise<void> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();
  const { data: invitations, error } = await supabase
    .from("invitations")
    .select("id")
    .eq("member_id", memberId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw createAuthError(500, "Chyba pri načítaní pozvánky.");
  if (!invitations) {
    throw createAuthError(404, "Žiadna aktívna pozvánka pre tohto člena.");
  }

  await revokeInvitation(invitations.id);

  await logSecurityEvent({
    userId: ctx.userId,
    module: AUDIT_MODULES.USERS,
    action: "invitation.revoke" as any,
    objectId: invitations.id,
    data: { member_id: memberId },
  });
}

/**
 * getMemberInvitationStatus – vráti stav prístupu člena (pozvánka, účet, bez prístupu).
 */
export async function getMemberInvitationStatus(memberId: string): Promise<{
  hasAccount: boolean;
  hasActiveInvitation: boolean;
  invitationStatus: string | null;
  invitationRole: string | null;
  invitationExpiresAt: string | null;
  accessStatus: string;
}> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member_access_status")
    .select("*")
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) throw createAuthError(500, "Chyba pri načítaní stavu prístupu.");

  const row = data as {
    access_status: string;
    auth_user_id: string | null;
    invitation_status: string | null;
    invitation_role: string | null;
    invitation_expires_at: string | null;
  } | null;

  return {
    hasAccount: !!row?.auth_user_id,
    hasActiveInvitation: row?.access_status === "invitation_pending",
    invitationStatus: row?.invitation_status ?? null,
    invitationRole: row?.invitation_role ?? null,
    invitationExpiresAt: row?.invitation_expires_at ?? null,
    accessStatus: row?.access_status ?? "no_account",
  };
}

// ============================================================================
// VYTAČENIE ID PODľa CODE (roles / permissions)
// ============================================================================

async function getRoleId(code: AppRole): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (error) throw createAuthError(500, "Chyba pri načítavaní ID role.");
  if (!data) throw createAuthError(404, "Nenájdená rola.");
  return data.id;
}

async function getPermissionId(code: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permissions")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (error) throw createAuthError(500, "Chyba pri načítavaní ID oprávnenia.");
  if (!data) throw createAuthError(404, "Nenájdené oprávnenie.");
  return data.id;
}