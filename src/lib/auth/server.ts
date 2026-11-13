import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasRole as checkRole, isAppRole, type AppRole } from "./roles";
import {
  hasPermission as checkPermission,
  hasAnyPermission as checkAnyPermission,
  type Permission,
} from "./permissions";
import {
  computeEffectivePermissions,
  isActiveMemberAccessProfile,
  mapPermissionCodes,
} from "./permissions-map";

export interface AuthContext {
  userId: string;
  email: string | undefined;
  memberId: string | null;
  role: AppRole | null;
  roles: AppRole[];
  permissions: Permission[];
}

function isMissingAuthSessionError(error: { message?: string } | null): boolean {
  if (!error) return false;
  return error.message === "Auth session missing!";
}

/**
 * Resolves the current auth user to a member and derives access from the
 * member-bound profile, role permissions, grants, and denials.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (isMissingAuthSessionError(userError)) redirect("/login");
  if (userError) throw new Error(`Unable to load authenticated user: ${userError.message}`);
  if (!user) redirect("/login");

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (memberError) {
    throw new Error(`Unable to load member profile: ${memberError.message}`);
  }

  const memberId = member?.id ?? null;
  if (!memberId) {
    return {
      userId: user.id,
      email: user.email,
      memberId: null,
      role: null,
      roles: [],
      permissions: [],
    };
  }

  const [profileResult, grantsResult, denialsResult] = await Promise.all([
    supabase
      .from("member_access_profiles")
      .select("role_id, status")
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

  if (profileResult.error) {
    throw new Error(`Unable to load member access profile: ${profileResult.error.message}`);
  }
  if (grantsResult.error) {
    throw new Error(`Unable to load member permission grants: ${grantsResult.error.message}`);
  }
  if (denialsResult.error) {
    throw new Error(`Unable to load member permission denials: ${denialsResult.error.message}`);
  }

  if (!isActiveMemberAccessProfile(profileResult.data?.status)) {
    return {
      userId: user.id,
      email: user.email,
      memberId,
      role: null,
      roles: [],
      permissions: [],
    };
  }

  const roles: AppRole[] = [];
  let rolePermissions: Permission[] = [];
  const roleId = profileResult.data?.role_id;

  if (roleId) {
    const { data: role, error: roleError } = await supabase
      .from("roles")
      .select("code")
      .eq("id", roleId)
      .maybeSingle();
    if (roleError) {
      throw new Error(`Unable to load member role: ${roleError.message}`);
    }
    if (!role || !isAppRole(role.code)) {
      throw new Error("Member access profile references an unknown role.");
    }
    roles.push(role.code);

    const { data: rolePermissionRows, error: rolePermissionsError } = await supabase
      .from("role_permissions")
      .select("permissions!role_permissions_permission_id_fkey(code)")
      .eq("role_id", roleId);
    if (rolePermissionsError) {
      throw new Error(`Unable to load role permissions: ${rolePermissionsError.message}`);
    }
    rolePermissions = mapPermissionCodes(
      rolePermissionRows ?? [],
    );
  }

  const directPermissions = mapPermissionCodes(
    grantsResult.data ?? [],
  );
  const deniedPermissions = mapPermissionCodes(
    denialsResult.data ?? [],
  );
  const permissions = computeEffectivePermissions(
    rolePermissions,
    directPermissions,
    deniedPermissions,
  );

  return {
    userId: user.id,
    email: user.email,
    memberId,
    role: roles[0] ?? null,
    roles,
    permissions,
  };
}

export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await getAuthContext();
  // Use member-centric check: if member has the permission
  if (ctx.memberId === null) {
    redirect("/access-denied");
  }
  const hasPerm = await hasPermissionServer(permission);
  if (hasPerm !== true) {
    redirect("/access-denied");
  }
  return ctx;
}

export async function requireAnyPermission(permissions: readonly Permission[]): Promise<AuthContext> {
  const ctx = await getAuthContext();
  // Use member-centric check: if member has any of the required permissions
  if (ctx.memberId === null) {
    redirect("/access-denied");
  }
  // Check if member has any of the required permissions
  const hasAny = await Promise.all(permissions.map((p) => hasPermissionServer(p)));
  const hasPerm = hasAny.some((result) => result === true);
  if (hasPerm !== true) {
    redirect("/access-denied");
  }
  return ctx;
}

export async function requireRole(role: AppRole): Promise<AuthContext> {
  const ctx = await getAuthContext();
  // Use member-centric check: if member has the role
  if (ctx.memberId === null) {
    redirect("/access-denied");
  }
  const hasRole = await hasRoleServer(role);
  if (hasRole !== true) {
    redirect("/access-denied");
  }
  return ctx;
}

export async function hasPermissionServer(permission: Permission): Promise<boolean> {
  const supabase = await createClient();
  const ctx = await getAuthContext();
  // Use member-centric RPC: member_has_permission(p_member_id, p_permission_code)
  // Never pass auth.users.id as p_member_id
  if (ctx.memberId === null) {
    return false;
  }
  const { data, error } = await supabase.rpc("member_has_permission", {
    p_member_id: ctx.memberId,
    p_permission_code: permission,
  });
  if (error) throw new Error(`Unable to check permission: ${error.message}`);
  return data === true;
}

export async function hasRoleServer(role: AppRole): Promise<boolean> {
  const supabase = await createClient();
  const ctx = await getAuthContext();
  // Use member-centric RPC: member_has_role(p_member_id, p_role_code)
  // Never pass auth.users.id as p_member_id
  if (ctx.memberId === null) {
    return false;
  }
  const { data, error } = await supabase.rpc("member_has_role", {
    p_member_id: ctx.memberId,
    p_role_code: role,
  });
  if (error) throw new Error(`Unable to check role: ${error.message}`);
  return data === true;
}