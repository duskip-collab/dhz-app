import { createClient } from "@/lib/supabase/server";
import { createAuthError } from "@/lib/members/members.errors";
import { requireAuthenticated } from "../documents/org-documents.auth";
import { isPermission, PERMISSIONS, type Permission, VISIBILITY_PERMISSIONS } from "@/lib/auth/permissions";
import { APP_ROLES, type AppRole, ROLE_LABELS, isAppRole } from "@/lib/auth/roles";
import { getMemberAccessDenial } from "@/lib/auth/access-policy";
import {
  mapPermissionCodes,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertAdminGate(ctx: {
  roles: readonly string[];
  permissions: readonly string[];
}): void {
  const isAdminOrCommander =
    ctx.roles.includes(APP_ROLES.ADMIN) ||
    ctx.roles.includes(APP_ROLES.VELITEL) ||
    ctx.permissions.includes(PERMISSIONS.ADMIN_USERS) ||
    ctx.permissions.includes(PERMISSIONS.ADMIN_PERMISSIONS);
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

  const memberIds = members.map((m) => m.id);
  const authUserIds = members
    .map((member) => member.auth_user_id)
    .filter((id): id is string => !!id);
  const authUserIdByMember = new Map(
    members.flatMap((member) => member.auth_user_id
      ? [[member.id, member.auth_user_id] as const]
      : []),
  );

  let userRoles: AdminUserRole[] = [];
  let userPermissions: AdminUserPermission[] = [];
  const codeHolders = new Set<string>();

  if (memberIds.length > 0) {
    const [profilesRes, grantsRes] = await Promise.all([
      supabase
        .from("member_access_profiles")
        .select("member_id, role_id")
        .in("member_id", memberIds),
      supabase
        .from("member_permission_grants")
        .select("member_id, permissions!member_permission_grants_permission_id_fkey(code)")
        .in("member_id", memberIds),
    ]);
    const codesRes = authUserIds.length > 0
      ? await supabase
        .from("member_access_codes")
        .select("user_id")
        .in("user_id", authUserIds)
      : null;

    if (profilesRes.error) {
      throw createAuthError(500, "Chyba pri načítaní členských prístupových profilov.");
    }
    if (grantsRes.error) {
      throw createAuthError(500, "Chyba pri načítaní individuálnych oprávnení.");
    }
    if (codesRes?.error) {
      throw createAuthError(500, "Chyba pri načítaní prístupových kódov.");
    }

    const roleIds = [...new Set((profilesRes.data ?? [])
      .map((profile) => profile.role_id)
      .filter((id): id is string => id !== null))];
    if (roleIds.length > 0) {
      const { data: roleRows, error: roleError } = await supabase
        .from("roles")
        .select("id, code")
        .in("id", roleIds);
      if (roleError) {
        throw createAuthError(500, "Chyba pri načítaní členských rolí.");
      }
      const roleCodeById = new Map(
        (roleRows ?? [])
          .map((row) => {
            if (!isAppRole(row.code)) {
              throw createAuthError(500, "Prístupový profil obsahuje neznámu rolu.");
            }
            return [row.id, row.code] as const;
          }),
      );
      if (roleCodeById.size !== roleIds.length) {
        throw createAuthError(500, "Niektorá priradená rola sa nenašla.");
      }
      userRoles = (profilesRes.data ?? []).flatMap((profile) => {
        const roleCode = profile.role_id ? roleCodeById.get(profile.role_id) : undefined;
        const userId = authUserIdByMember.get(profile.member_id);
        return roleCode && userId ? [{ user_id: userId, role_code: roleCode }] : [];
      });
    }

    userPermissions = (grantsRes.data ?? []).flatMap((grant) => {
      const permissionCode = mapPermissionCodes([grant])[0];
      const userId = authUserIdByMember.get(grant.member_id);
      return permissionCode && userId
        ? [{ user_id: userId, permission_code: permissionCode }]
        : [];
    });

    for (const c of codesRes?.data ?? []) {
      codeHolders.add(c.user_id);
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
 * setUserRole – nastaví rolu v členskom prístupovom profile.
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
  const memberId = await resolveMemberIdForAuthUser(userId);
  const currentAccess = await readMemberAccessMutationState(memberId);
  await saveMemberAccess(memberId, {
    roleCode,
    grantPermissions: currentAccess.grantPermissions,
    denyPermissions: currentAccess.denyPermissions,
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
  if (!userId || !isPermission(permissionCode)) {
    throw createAuthError(400, "Neplatné vstupné údaje.");
  }

  const memberId = await resolveMemberIdForAuthUser(userId);
  const currentAccess = await readMemberAccessMutationState(memberId);
  const grantPermissions = new Set(currentAccess.grantPermissions);
  const denyPermissions = new Set(currentAccess.denyPermissions);
  if (enabled) {
    grantPermissions.add(permissionCode);
    denyPermissions.delete(permissionCode);
  } else {
    grantPermissions.delete(permissionCode);
  }

  await saveMemberAccess(memberId, {
    roleCode: currentAccess.roleCode,
    grantPermissions: [...grantPermissions],
    denyPermissions: [...denyPermissions],
  });
}

/**
 * generateMemberAccessCode – vygeneruje jedinečný prístupový kód pre člena
 * s existujúcim auth_user_id (kód sa stane heslom v auth.users).
 */
export async function generateMemberAccessCode(userId: string): Promise<string> {
  const ctx = await requireAuthenticated();
  assertAdminGate(ctx);

  const supabase = await createClient();
  const code = crypto.randomUUID().toUpperCase();
  const { data, error } = await supabase.rpc("set_member_access_code", {
    p_user_id: userId,
    p_code: code,
  });
  if (error) throw createAuthError(500, "Chyba pri generovaní prístupového kódu.");
  return data;
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
    const code = crypto.randomUUID().toUpperCase();
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
  const denial = getMemberAccessDenial({
    actorMemberId: ctx.memberId,
    targetMemberId: memberId,
    actorRoles: ctx.roles,
    actorPermissions: ctx.permissions,
    targetRole: roleCode,
  });
  if (denial) {
    throw createAuthError(403, "Nemáte oprávnenie na vytvorenie pozvánky s touto rolou.");
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

async function resolveMemberIdForAuthUser(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw createAuthError(500, "Chyba pri načítaní člena.");
  if (!data) throw createAuthError(404, "Člen s týmto účtom sa nenašiel.");
  return data.id;
}

async function readMemberAccessMutationState(memberId: string): Promise<{
  roleCode: AppRole;
  grantPermissions: Permission[];
  denyPermissions: Permission[];
}> {
  const supabase = await createClient();
  const [profile, grants, denials] = await Promise.all([
    supabase.from("member_access_profiles").select("role_id").eq("member_id", memberId).maybeSingle(),
    supabase
      .from("member_permission_grants")
      .select("permissions!member_permission_grants_permission_id_fkey(code)")
      .eq("member_id", memberId),
    supabase
      .from("member_permission_denials")
      .select("permissions!member_permission_denials_permission_id_fkey(code)")
      .eq("member_id", memberId),
  ]);
  if (profile.error || grants.error || denials.error) {
    throw createAuthError(500, "Chyba pri načítaní aktuálnych oprávnení člena.");
  }

  let roleCode: AppRole = APP_ROLES.CLEN;
  if (profile.data?.role_id) {
    const { data: role, error } = await supabase
      .from("roles")
      .select("code")
      .eq("id", profile.data.role_id)
      .maybeSingle();
    if (error) throw createAuthError(500, "Chyba pri načítaní aktuálnej role.");
    if (!role || !isAppRole(role.code)) {
      throw createAuthError(500, "Profil člena odkazuje na neznámu rolu.");
    }
    roleCode = role.code;
  }

  return {
    roleCode,
    grantPermissions: mapPermissionCodes(grants.data ?? []),
    denyPermissions: mapPermissionCodes(denials.data ?? []),
  };
}

// ============================================================================
// K24 – PRÍSTUPOVÉ OPRÁVNENIA ČLENA (detail + uloženie)
// ============================================================================

export interface MemberPermissionEntry {
  code: Permission;
  name: string;
  source: "inherited" | "granted" | "denied" | "none";
  inherited: boolean;
  granted: boolean;
  denied: boolean;
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

  // Načítame z členom-viazaných tabuliek – funguje aj bez auth_user_id.
  const [profileRes, grantsRes, denialsRes] = await Promise.all([
    supabase
      .from("member_access_profiles")
      .select("role_id")
      .eq("member_id", memberId)
      .maybeSingle(),
    supabase
      .from("member_permission_grants")
      .select("permissions!member_permission_grants_permission_id_fkey(code)")
      .eq("member_id", memberId),
    supabase
      .from("member_permission_denials")
      .select("permissions!member_permission_denials_permission_id_fkey(code)")
      .eq("member_id", memberId),
  ]);

  if (profileRes.error) throw createAuthError(500, "Chyba pri načítaní profilu prístupu.");
  if (grantsRes.error) throw createAuthError(500, "Chyba pri načítaní oprávnení.");
  if (denialsRes.error) throw createAuthError(500, "Chyba pri načítaní odobratí.");

  // Načítame rolu z member_access_profiles
  if (profileRes.data && profileRes.data.role_id) {
    const roleRes = await supabase
      .from("roles")
      .select("code")
      .eq("id", profileRes.data.role_id)
      .maybeSingle();
    if (roleRes.error) throw createAuthError(500, "Chyba pri načítaní role.");
    if (roleRes.data && isAppRole(roleRes.data.code)) {
      role = roleRes.data.code;
      userRoles = [role];
    }
  }

  directPermissions = mapPermissionCodes(grantsRes.data ?? []);
  deniedPermissions = mapPermissionCodes(denialsRes.data ?? []);

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
        inherited,
        granted,
        denied,
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
  const accessDenial = getMemberAccessDenial({
    actorMemberId: ctx.memberId,
    targetMemberId: memberId,
    actorRoles: ctx.roles,
    actorPermissions: ctx.permissions,
    targetRole: roleCode,
  });
  if (accessDenial) {
    if (accessDenial === "self_target") {
      throw createAuthError(403, "Používateľ nesmie meniť vlastný prístup.");
    }
    if (accessDenial === "admin_role_restricted") {
      throw createAuthError(403, "Pridelenie roly ADMIN smie vykonať iba používateľ s rolou ADMIN.");
    }
    throw createAuthError(403, "Nemáte oprávnenie na zmenu prístupov.");
  }

  // Pôvodné hodnoty pre audit.
  const before = await loadMemberAccessDetail(memberId);

  // Overíme, že člen existuje (member-bound prístup – nie je potrebný auth_user_id).
  const supabase = await createClient();
  const { data: memberData, error: memErr } = await supabase
    .from("members")
    .select("id")
    .eq("id", memberId)
    .maybeSingle();
  if (memErr) {
    console.error("[saveMemberAccess] member lookup error:", memErr);
    throw createAuthError(500, "Chyba pri načítaní člena.");
  }
  if (!memberData) {
    throw createAuthError(404, "Člen sa nenašiel.");
  }

  // Voláme member-bound RPC – prístupy patria na members.id, nie auth.users.id.
  const { data, error } = await supabase.rpc("set_member_access_member", {
    p_member_id: memberId,
    p_role_code: roleCode,
    p_grant_permissions: grantPermissions,
    p_deny_permissions: denyPermissions,
  });

  if (error) {
    console.error("[saveMemberAccess] RPC error:", error);
    throw createAuthError(500, "Uloženie prístupov zlyhalo.");
  }
  const result = isRecord(data) ? data : null;
  if (!result || result.success !== true) {
    const errCode = typeof result?.error === "string" ? result.error : "unknown";
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
    if (errCode === "finance_access_restricted") {
      throw createAuthError(403, "Finančné oprávnenia sa prideľujú iba cez schválené roly.");
    }
    if (errCode === "admin_permission_restricted") {
      throw createAuthError(403, "Administrátorské oprávnenia sa prideľujú výhradne cez rolu ADMIN.");
    }
    if (errCode === "unknown_role") {
      throw createAuthError(400, "Neznáma alebo nepodporovaná rola.");
    }
    if (errCode === "member_not_found") {
      throw createAuthError(404, "Člen sa nenašiel.");
    }
    throw createAuthError(500, `Uloženie prístupov zlyhalo (${errCode}).`);
  }

  // Audit: rola + pridané / odobrané oprávnenia.
  const after = await loadMemberAccessDetail(memberId);
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
      old_role: before.role ?? null,
      new_role: typeof result.new_role === "string" ? result.new_role : roleCode,
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
  const accessDenial = getMemberAccessDenial({
    actorMemberId: ctx.memberId,
    targetMemberId: params.memberId,
    actorRoles: ctx.roles,
    actorPermissions: ctx.permissions,
    targetRole: params.roleCode,
  });
  if (accessDenial) {
    throw createAuthError(403, "Nemáte oprávnenie na vytvorenie aktivačného kódu s touto rolou.");
  }
  if (params.permissions.some((permission) => !isPermission(permission))) {
    throw createAuthError(400, "Aktivačný kód obsahuje neznáme oprávnenie.");
  }
  const financeWritePermissions: Permission[] = [
    PERMISSIONS.FINANCE_CREATE,
    PERMISSIONS.FINANCE_EDIT,
    PERMISSIONS.FINANCE_EXPORT,
  ];
  const financeViewRoles: AppRole[] = [
    APP_ROLES.ADMIN,
    APP_ROLES.VEDENIE,
    APP_ROLES.POKLADNIK,
  ];
  const financeWriteRoles: AppRole[] = [APP_ROLES.ADMIN, APP_ROLES.POKLADNIK];
  const hasRestrictedGrant = params.permissions.some((permission) => {
    if (permission.startsWith("admin.")) return true;
    if (permission === PERMISSIONS.FINANCE_VIEW) {
      return !financeViewRoles.includes(params.roleCode);
    }
    if (financeWritePermissions.includes(permission)) {
      return !financeWriteRoles.includes(params.roleCode);
    }
    return permission === PERMISSIONS.FINANCE_MANAGE_ACCESS &&
      params.roleCode !== APP_ROLES.ADMIN;
  });
  if (hasRestrictedGrant) {
    throw createAuthError(403, "Aktivačný kód nemôže obísť finančné ani administrátorské obmedzenia.");
  }

  const validDays = params.validityDays ?? 14;
  if (!Number.isFinite(validDays) || validDays <= 0 || validDays > 365) {
    throw createAuthError(400, "Neplatná dĺžka platnosti kódu.");
  }
  const maxUses = params.maxUses ?? 1;
  if (!Number.isInteger(maxUses) || maxUses !== 1) {
    throw createAuthError(400, "Aktivačný kód musí byť jednorazový.");
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
    p_max_uses: 1,
    p_notes: "Aktivačný kód (K24)",
    p_permission_codes: params.permissions,
  });

  if (error) {
    console.error("[generateActivationCode] create_invitation error:", error);
    throw createAuthError(500, "Aktivačný kód sa nepodarilo vytvoriť.");
  }
  if (typeof data !== "string") {
    throw createAuthError(500, "Aktivačný kód sa nepodarilo vytvoriť.");
  }
  const invitationId = data;

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

