import { createClient } from "@/lib/supabase/server";
import { createAuthError } from "@/lib/members/members.errors";
import { requireAuthenticated } from "../documents/org-documents.auth";
import { PERMISSIONS, type Permission, VISIBILITY_PERMISSIONS } from "@/lib/auth/permissions";
import { APP_ROLES, type AppRole, ROLE_LABELS, isAppRole } from "@/lib/auth/roles";
import {
  computeEffectivePermissions,
  mapPermissionCodes,
  mapRoleCodes,
} from "@/lib/auth/permissions-map";
import { logSecurityEvent, AUDIT_MODULES, AUDIT_ACTIONS } from "@/lib/audit/audit.service";
import {
  createInvitation,
  revokeInvitation,
} from "@/lib/auth/invitations.service";
import {
  generateInvitationCode,
  hashInvitationCode,
} from "@/lib/auth/invitations.share";

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
  // ADMIN rola je osobitne chránená: iba volajúci s rolu ADMIN smie člena na ADMIN povýšiť.
  if (roleCode === APP_ROLES.ADMIN && !ctx.roles.includes(APP_ROLES.ADMIN)) {
    throw createAuthError(
      403,
      "Pridelenie roly ADMIN smie vykonat iba používateľ s rolu ADMIN.",
    );
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
    action: AUDIT_ACTIONS.USER_ROLE_ASSIGN,
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
): Promise<
  | { kind: "login"; code: string }
  | { kind: "invitation"; code: string; invitationId: string; expiresAt: string }
> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("auth_user_id")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) {
    console.error("[generateMemberAccessCodeForMember] member lookup error:", memberError);
    throw createAuthError(500, "Chyba pri načítaní člena.");
  }
  if (!member) throw createAuthError(404, "Člen sa nenašiel.");

  if (member.auth_user_id) {
    const code = crypto.randomUUID().slice(-6).toUpperCase();
    const { error } = await supabase.rpc("set_member_access_code", {
      p_user_id: member.auth_user_id,
      p_code: code,
    });
    if (error) {
      console.error("[generateMemberAccessCodeForMember] access code RPC error:", error);
      throw createAuthError(500, "Chyba pri generovaní prihlasovacieho kódu.");
    }

    return { kind: "login", code };
  }

  if (!isAppRole(roleCode)) {
    throw createAuthError(400, "Neplatný kód role.");
  }
  const created = await createInvitation({
    role: roleCode,
    memberId,
    maxUses: 1,
    validDays: 14,
    notes: "Prístupový kód pre člena (K16.0)",
  });

  await logSecurityEvent({
    userId: ctx.userId,
    module: AUDIT_MODULES.USERS,
    action: AUDIT_ACTIONS.INVITATION_CREATE,
    objectId: created.invitation.id,
    data: { member_id: memberId, role_code: roleCode },
  });

  return {
    kind: "invitation",
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
    action: AUDIT_ACTIONS.INVITATION_REVOKE,
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

// ============================================================================
// K24 – PRÍSTUPOVÉ OPRÁVNENIA ČLENA (detail + uloženie)
// ============================================================================

export interface MemberPermissionEntry {
  code: Permission;
  name: string;
  source: "inherited" | "granted" | "denied" | "none";
}

export interface MemberAccessDetail {
  member: AdminMemberRow;
  role: AppRole | null;
  permissions: MemberPermissionEntry[];
  activationCodes: ActivationCodeRow[];
}

export interface ActivationCodeRow {
  id: string;
  role: AppRole;
  status: string;
  use_count: number;
  max_uses: number;
  expires_at: string;
  created_at: string;
}

/**
 * K24.2/K24.4 – Načíta prístupový detail člena s rozlíšením zdroja oprávnení.
 * Zdroj: inherited (z roly), granted (individuálne pridané), denied (individuálne odobrané), none.
 */
export async function loadMemberAccessDetail(
  memberId: string,
): Promise<MemberAccessDetail> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select(
      "id, member_number, first_name, last_name, position, rank, email, status, auth_user_id",
    )
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) {
    console.error("[loadMemberAccessDetail] member error:", memberError);
    throw createAuthError(500, "Chyba pri načítavaní člena.");
  }
  if (!member) throw createAuthError(404, "Člen sa nenašiel.");

  const adminMember: AdminMemberRow = {
    member_id: member.id,
    member_number: member.member_number,
    first_name: member.first_name,
    last_name: member.last_name,
    position: member.position,
    rank: member.rank,
    email: member.email,
    status: member.status,
    auth_user_id: member.auth_user_id,
    has_account: !!member.auth_user_id,
    has_access_code: false,
  };

  let role: AppRole | null = null;
  let userRoles: AppRole[] = [];
  let directPermissions: Permission[] = [];
  let deniedPermissions: Permission[] = [];

  if (adminMember.auth_user_id) {
    const [rolesRes, permsRes, denialsRes] = await Promise.all([
      supabase
        .from("user_roles")
        .select("roles!user_roles_role_id_fkey(code)")
        .eq("user_id", adminMember.auth_user_id),
      supabase
        .from("user_permissions")
        .select("permissions!user_permissions_permission_id_fkey(code)")
        .eq("user_id", adminMember.auth_user_id),
      supabase
        .from("user_permission_denials")
        .select(
          "permissions!user_permission_denials_permission_id_fkey(code)",
        )
        .eq("user_id", adminMember.auth_user_id),
    ]);

    if (rolesRes.error) throw createAuthError(500, "Chyba pri načítaní rolí.");
    if (permsRes.error)
      throw createAuthError(500, "Chyba pri načítaní oprávnení.");
    if (denialsRes.error)
      throw createAuthError(500, "Chyba pri načítaní odobratí.");

    userRoles = mapRoleCodes(
      (rolesRes.data ?? []) as unknown as { roles: { code: string } | null }[],
    );
    directPermissions = mapPermissionCodes(
      (permsRes.data ?? []) as unknown as {
        permissions: { code: string } | null;
      }[],
    );
    deniedPermissions = mapPermissionCodes(
      (denialsRes.data ?? []) as unknown as {
        permissions: { code: string } | null;
      }[],
    );
    role = userRoles[0] ?? null;
  }

  let rolePermissions: Permission[] = [];
  if (userRoles.length) {
    const roleIdsRes = await supabase
      .from("roles")
      .select<"id">("id")
      .in("code", userRoles);
    if (roleIdsRes.error)
      throw createAuthError(500, "Chyba pri načítaní ID rolí.");
    const roleIds = ((roleIdsRes.data ?? []) as { id: string }[]).map(
      (r) => r.id,
    );
    if (roleIds.length) {
      const rpRes = await supabase
        .from("role_permissions")
        .select("permissions!role_permissions_permission_id_fkey(code)")
        .in("role_id", roleIds);
      if (rpRes.error)
        throw createAuthError(500, "Chyba pri načítaní oprávnení rolí.");
      rolePermissions = mapPermissionCodes(
        (rpRes.data ?? []) as unknown as {
          permissions: { code: string } | null;
        }[],
      );
    }
  }

  const effective = computeEffectivePermissions(
    rolePermissions,
    directPermissions,
    deniedPermissions,
  );

  const permissionEntries: MemberPermissionEntry[] = VISIBILITY_PERMISSIONS.map(
    (code) => {
      const inherited = rolePermissions.includes(code);
      const granted = directPermissions.includes(code);
      const denied = deniedPermissions.includes(code);
      let source: MemberPermissionEntry["source"] = "none";
      if (denied) source = "denied";
      else if (granted && !inherited) source = "granted";
      else if (inherited && !granted) source = "inherited";
      else if (inherited && granted) source = "granted";

      return {
        code,
        name: PERMISSION_LABELS[code] ?? code,
        source,
      };
    },
  );

  const { data: codes, error: codesError } = await supabase
    .from("invitations")
    .select(
      "id, role, status, use_count, max_uses, expires_at, created_at",
    )
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  if (codesError) {
    console.error("[loadMemberAccessDetail] codes error:", codesError);
    throw createAuthError(500, "Chyba pri načítaní aktivačných kódov.");
  }

  const activationCodes: ActivationCodeRow[] = (codes ?? []).map((c) => ({
    id: c.id,
    role: isAppRole(c.role) ? c.role : APP_ROLES.CLEN,
    status: c.status,
    use_count: c.use_count,
    max_uses: c.max_uses,
    expires_at: c.expires_at,
    created_at: c.created_at,
  }));

  return {
    member: adminMember,
    role,
    permissions: permissionEntries,
    activationCodes,
  };
}

/**
 * K24.5 – Atomické uloženie role + individuálnych oprávnení cez DB RPC transakciu.
 * Zmeny sa ukladajú iba všetky, alebo žiadne. Záznam auditu obsahuje starú a novú rolu
 * orazi pridané a odobrané oprávnenia.
 */
export interface SaveMemberAccessPayload {
  roleCode: AppRole;
  grantPermissions: Permission[];
  denyPermissions: Permission[];
}

export async function saveMemberAccess(
  memberId: string,
  payload: SaveMemberAccessPayload,
): Promise<void> {
  const ctx = await requireAuthenticated();
  // Mutácia prístupu vyžaduje admin.users (zhodu s DB RPC).
  if (
    !ctx.permissions.includes(PERMISSIONS.ADMIN_USERS) &&
    !ctx.roles.includes(APP_ROLES.ADMIN)
  ) {
    throw createAuthError(403, "Nemáte oprávnenie na zmenu prístupov.");
  }

  const { roleCode, grantPermissions, denyPermissions } = payload;

  if (!isAppRole(roleCode)) {
    throw createAuthError(400, "Neplatný kód role.");
  }
  if (memberId === ctx.userId && roleCode === APP_ROLES.ADMIN) {
    throw createAuthError(403, "Self-escalation nie je povolená.");
  }
  if (
    roleCode === APP_ROLES.ADMIN &&
    !ctx.roles.includes(APP_ROLES.ADMIN)
  ) {
    throw createAuthError(
      403,
      "Pridelenie roly ADMIN smie vykonat iba používateľ s rolu ADMIN.",
    );
  }

  // Pôvodné hodnoty pre audit.
  const before = await loadMemberAccessDetail(memberId).catch(() => null);

  const supabase = await createClient();
  const { data: memberData, error: memErr } = await supabase
    .from("members")
    .select("id, auth_user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (memErr || !memberData) {
    throw createAuthError(404, "Člen sa nenašiel.");
  }
  if (!memberData.auth_user_id) {
    throw createAuthError(400, "Člen nemá vytvorený používateľský účet. Najprv vygenerujte aktivačný kód alebo pozvánku.");
  }
  const userId = memberData.auth_user_id;

  const { data, error } = await supabase.rpc("set_member_access", {
    p_user_id: userId,
    p_role_code: roleCode,
    p_grant_permissions: grantPermissions,
    p_deny_permissions: denyPermissions,
  });

  if (error) {
    console.error("[saveMemberAccess] RPC error:", error);
    throw createAuthError(500, "Uloženie prístupov zlyhalo.");
  }
  const result = data as
    | { success: boolean; error?: string; old_role?: string; new_role?: string }
    | null;
  if (!result || result.success !== true) {
    const errCode = result?.error ?? "unknown";
    if (errCode === "invalid_permission") {
      throw createAuthError(400, "Chybná alebo nepovolená sada oprávnení.");
    }
    if (errCode === "forbidden" || errCode === "not_authenticated") {
      throw createAuthError(403, "Nemáte oprávnenie na túto akciu.");
    }
    if (errCode === "self_escalation") {
      throw createAuthError(403, "Self-escalation nie je povolená.");
    }
    if (errCode === "admin_role_restricted") {
      throw createAuthError(403, "Pridelenie roly ADMIN smie vykonať iba používateľ s rolou ADMIN.");
    }
    if (errCode === "unknown_role") {
      throw createAuthError(400, "Neznáma alebo nepodporovaná rola.");
    }
    throw createAuthError(500, `Uloženie prístupov zlyhalo (${errCode}).`);
  }

  // Audit: rola + pridané / odobrané oprávnenia.
  const after = await loadMemberAccessDetail(memberId).catch(() => null);
  const beforeCodes = new Set((before?.permissions ?? []).map((p) => p.code));
  const afterCodes = new Set((after?.permissions ?? []).map((p) => p.code));
  const added = [...afterCodes].filter((c) => !beforeCodes.has(c));
  const removed = [...beforeCodes].filter((c) => !afterCodes.has(c));

  await logSecurityEvent({
    userId: ctx.userId,
    module: AUDIT_MODULES.USERS,
    action: AUDIT_ACTIONS.USER_ACCESS_UPDATE,
    objectId: memberId,
    data: {
      target_member_id: memberId,
      old_role: before?.role ?? null,
      new_role: result.new_role ?? roleCode,
      added_permissions: added,
      removed_permissions: removed,
    },
  });
}


/**
 * K24.6 – Generovanie aktivačného kódu pre člena (role + sada oprávnení + platnosť).
 */
export interface GenerateActivationCodeParams {
  memberId: string;
  roleCode: AppRole;
  permissions: Permission[];
  validityDays: number;
  maxUses: number;
}

export async function generateActivationCode(
  params: GenerateActivationCodeParams,
): Promise<{
  code: string;
  invitationId: string;
  expiresAt: string;
}> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  if (!isAppRole(params.roleCode)) {
    throw createAuthError(400, "Neplatný kód role.");
  }
  // ADMIN cez aktivačný kód môže vytvoriť iba sám ADMIN (vynucuje aj DB RPC).
  if (
    params.roleCode === APP_ROLES.ADMIN &&
    !ctx.roles.includes(APP_ROLES.ADMIN)
  ) {
    throw createAuthError(
      403,
      "Pridelenie roly ADMIN cez aktivačný kód smie vykonat iba ADMIN.",
    );
  }

  const validDays = params.validityDays ?? 14;
  if (!Number.isFinite(validDays) || validDays <= 0 || validDays > 365) {
    throw createAuthError(400, "Neplatná dĺžka platnosti kódu.");
  }
  const maxUses = params.maxUses ?? 1;
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
    throw createAuthError(400, "Neplatný počet povolených použití kódu.");
  }

  const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000)
    .toISOString();

  const supabase = await createClient();
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .eq("id", params.memberId)
    .maybeSingle();
  if (memberError) throw createAuthError(500, "Chyba pri načítaní člena.");
  if (!member) throw createAuthError(404, "Člen sa nenašiel.");

  // Raw kód sa generuje kryptograficky bezpečne (Web Crypto) – iba raz, v pamäti.
  const rawCode = generateInvitationCode();
  const codeHash = await hashInvitationCode(rawCode);

  const { data, error } = await supabase.rpc("create_invitation", {
    p_role_code: params.roleCode,
    p_code_hash: codeHash,
    p_expires_at: expiresAt,
    p_member_id: params.memberId,
    p_max_uses: maxUses,
    p_notes: "Aktivačný kód (K24)",
  });

  if (error) {
    console.error("[generateActivationCode] create_invitation error:", error);
    throw createAuthError(500, "Aktivačný kód sa nepodarilo vytvoriť.");
  }
  const invitationId = (data as string) ?? "";

  // Oprávnenia schválené v kóde (viazaná na pozvánku).
  if (params.permissions.length) {
    const permIds = await Promise.all(
      params.permissions.map((code) => getPermissionId(code)),
    );
    const { error: permError } = await supabase
      .from("invitation_permissions")
      .insert(
        permIds.map((permissionId) => ({
          invitation_id: invitationId,
          permission_id: permissionId,
        })),
      );
    if (permError) {
      console.error("[generateActivationCode] permission insert error:", permError);
      throw createAuthError(500, "Oprávnenia kódu sa nepodarilo uložiť.");
    }
  }

  await logSecurityEvent({
    userId: ctx.userId,
    module: AUDIT_MODULES.USERS,
    action: AUDIT_ACTIONS.ACTIVATION_CODE_CREATE,
    objectId: invitationId,
    data: {
      member_id: params.memberId,
      role_code: params.roleCode,
      permissions: params.permissions,
      max_uses: maxUses,
    },
  });

  return { code: rawCode, invitationId, expiresAt };
}

/**
 * K24.6 – Zrušenie nevyužitého aktivačného kódu člena.
 */
export async function revokeActivationCode(memberId: string): Promise<void> {
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

  if (error) throw createAuthError(500, "Chyba pri načítaní kódu.");
  if (!invitations) {
    throw createAuthError(404, "Žiadny aktívny aktivačný kód pre tohto člena.");
  }

  await supabase.rpc("revoke_invitation", {
    p_invitation_id: invitations.id,
  });

  await logSecurityEvent({
    userId: ctx.userId,
    module: AUDIT_MODULES.USERS,
    action: AUDIT_ACTIONS.ACTIVATION_CODE_REVOKE,
    objectId: invitations.id,
    data: { member_id: memberId },
  });
}

/**
 * Zoznam aktivačných kódov člena (pre prehľad v detailu).
 */
export async function listActivationCodesForMember(
  memberId: string,
): Promise<ActivationCodeRow[]> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select(
      "id, role, status, use_count, max_uses, expires_at, created_at",
    )
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  if (error) throw createAuthError(500, "Chyba pri načítaní aktivačných kódov.");
  return (data ?? []).map((c) => ({
    id: c.id,
    role: isAppRole(c.role) ? c.role : APP_ROLES.CLEN,
    status: c.status,
    use_count: c.use_count,
    max_uses: c.max_uses,
    expires_at: c.expires_at,
    created_at: c.created_at,
  }));
}


// ============================================================================
// Katalog oprávnení s popisom (pre admin UI)
// ============================================================================

export interface PermissionCatalogEntry {
  code: Permission;
  name: string;
  description: string | null;
}

export async function listPermissionCatalogFull(): Promise<
  PermissionCatalogEntry[]
> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permissions")
    .select("code, name, description")
    .order("code");

  if (error) throw createAuthError(500, "Chyba pri načítaní oprávnení.");
  return ((data ?? []) as Array<{
    code: string;
    name: string;
    description: string | null;
  }>)
    .filter((p) => (VISIBILITY_PERMISSIONS as readonly string[]).includes(p.code))
    .map((p) => ({ code: p.code as Permission, name: p.name, description: p.description }));
}

// Popisná mena oprávnení pre UI (SLK). Kanonické kódy sa nemenia.
const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.view": "Dashboard – zobrazenie",
  "members.view": "Členovia – zobrazenie",
  "members.create": "Členovia – vytvorenie",
  "members.edit": "Členovia – úprava",
  "members.delete": "Členovia – zmazanie",
  "training.view": "Tréningy – zobrazenie",
  "training.create": "Tréningy – vytvorenie",
  "training.edit": "Tréningy – úprava",
  "competition.view": "Súťaže – zobrazenie",
  "competition.create": "Súťaže – vytvorenie",
  "competition.edit": "Súťaže – úprava",
  "calendar.view": "Kalendár – zobrazenie",
  "calendar.manage": "Kalendár – správa",
  "inventory.view": "Inventár – zobrazenie",
  "inventory.create": "Inventár – vytvorenie",
  "inventory.edit": "Inventár – úprava",
  "inventory.manage": "Inventár – správa",
  "vehicle.view": "Vozidlá – zobrazenie",
  "vehicle.manage": "Vozidlá – správa",
  "fault.create": "Poruchy – nahlásenie",
  "fault.manage": "Poruchy – správa",
  "finance.view": "Financie – zobrazenie",
  "finance.create": "Financie – vytvorenie",
  "finance.edit": "Financie – úprava",
  "finance.export": "Financie – export",
  "finance.manage_access": "Financie – prístupy",
  "documents.view": "Dokumenty – zobrazenie",
  "documents.upload": "Dokumenty – nahrávanie",
  "reports.view": "Reporty – zobrazenie",
  "reports.export": "Reporty – export",
  "communication.view": "Komunikácia – zobrazenie",
  "communication.send": "Komunikácia – odoslanie",
  "admin.users": "Administrácia – používatelia",
  "admin.permissions": "Administrácia – oprávnenia",
  "admin.audit": "Administrácia – audit",
  "announcements.view": "Oznámenia – zobrazenie",
  "announcements.create": "Oznámenia – vytvorenie",
  "announcements.edit": "Oznámenia – úprava",
  "announcements.delete": "Oznámenia – zmazanie",
  "meetings.view": "Schôdze – zobrazenie",
  "meetings.create": "Schôdze – vytvorenie",
  "meetings.edit": "Schôdze – úprava",
  "meetings.delete": "Schôdze – zmazanie",
  "work_parties.view": "Pracovné skupinky – zobrazenie",
  "work_parties.create": "Pracovné skupinky – vytvorenie",
  "work_parties.edit": "Pracovné skupinky – úprava",
  "work_parties.delete": "Pracovné skupinky – zmazanie",
  "incidents.view": "Hlásenia – zobrazenie",
  "incidents.create": "Hlásenia – vytvorenie",
  "incidents.edit": "Hlásenia – úprava",
  "incidents.delete": "Hlásenia – zmazanie",
  "inspection.view": "Inšpekcie – zobrazenie",
  "inspection.manage": "Inšpekcie – správa",
};

