const fs = require("fs");
const parts = [];

parts.push(`import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasRole as checkRole, type AppRole } from "./roles";
import {
  hasPermission as checkPermission,
  hasAnyPermission as checkAnyPermission,
  type Permission,
} from "./permissions";
import { mapPermissionCodes } from "./permissions-map";

export interface AuthContext {
  userId: string;
  email: string | undefined;
  memberId: string | null;
  roles: AppRole[];
  permissions: Permission[];
  const { data: grantsResult, error: grantsError } = await supabase
    .from("member_permission_grants")
    .select("permissions!member_permission_grants_permission_id_fkey(code)")
    .eq("member_id", memberId);

  if (grantsError) {
    throw new Error(\`Unable to load member permissions: \${grantsError.message}\`);
  }

  const directPermissions = mapPermissionCodes(
    (grantsResult.data ?? []) as unknown as { permissions: { code: string } | null }[],
  );

  const { data: denialsResult, error: denialsError } = await supabase
    .from("member_permission_denials")
    .select("permissions!member_permission_denials_permission_id_fkey(code)")
    .eq("member_id", memberId);

  if (denialsError) {
    throw new Error(\`Unable to load denied permissions: \${denialsError.message}\`);
  }

  const deniedPermissions = mapPermissionCodes(
    (denialsResult.data ?? []) as unknown as { permissions: { code: string } | null }[],
  );

  const allPermissions = Array.from(new Set([...rolePermissions, ...directPermissions]));
  const permissions = allPermissions.filter((p) => !deniedPermissions.includes(p));

  return { userId: user.id, email: user.email, memberId, roles, permissions };
}

export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!checkPermission(ctx.permissions, permission)) redirect("/access-denied");
  return ctx;
}

export async function requireAnyPermission(permissions: readonly Permission[]): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!checkAnyPermission(ctx.permissions, permissions)) redirect("/access-denied");
  return ctx;
}

export async function requireRole(role: AppRole): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!checkRole(ctx.roles, role)) redirect("/access-denied");
  return ctx;
}
`);
 * Server-side: načita aktuálneho usera + jeho rolu a oprávnenia z členského modelu.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (isMissingAuthSessionError(userError)) redirect("/login");
  if (userError) throw new Error(\`Unable to load authenticated user: \${userError.message}\`);
  if (!user) redirect("/login");

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (memberError) {
    throw new Error(\`Unable to load member profile: \${memberError.message}\`);
  }

  const memberId = member?.id ?? null;

  if (!memberId) {
    return { userId: user.id, email: user.email, memberId: null, roles: [], permissions: [] };
  }

  const { data: profile, error: profileError } = await supabase
    .from("member_access_profiles")
    .select("role_id")
    .eq("member_id", memberId)
    .maybeSingle();

  if (profileError) {
    throw new Error(\`Unable to load member access profile: \${profileError.message}\`);
  }

  let roles: AppRole[] = [];
  let rolePermissions: Permission[] = [];

  if (profile && profile.role_id) {
    const { data: roleRow, error: roleError } = await supabase
      .from("roles")
      .select("code")
      .eq("id", profile.role_id)
      .maybeSingle();

    if (roleError) {
      throw new Error(\`Unable to load role: \${roleError.message}\`);
    }

    if (roleRow && roleRow.code) {
      const roleCode = roleRow.code as AppRole;
      if (isAppRole(roleCode)) {
        roles = [roleCode];
      }
    }

    const { data: rolePermsResult, error: rolePermsError } = await supabase
      .from("role_permissions")
      .select("permissions!role_permissions_permission_id_fkey(code)")
      .eq("role_id", profile.role_id);

    if (rolePermsError) {
      throw new Error(\`Unable to load role permissions: \${rolePermsError.message}\`);
    }

    rolePermissions = mapPermissionCodes(
      (rolePermsResult.data ?? []) as unknown as { permissions: { code: string } | null }[],
    );
  }

  const { data: grantsResult, error: grantsError } = await supabase
    .from("member_permission_grants")
    .select("permissions!member_permission_grants_permission_id_fkey(code)")
    .eq("member_id", memberId);

  if (grantsError) {
    throw new Error(\`Unable to load member permissions: \${grantsError.message}\`);
  }

  const directPermissions = mapPermissionCodes(
    (grantsResult.data ?? []) as unknown as { permissions: { code: string } | null }[],
  );

  const { data: denialsResult, error: denialsError } = await supabase
    .from("member_permission_denials")
    .select("permissions!member_permission_denials_permission_id_fkey(code)")
    .eq("member_id", memberId);

  if (denialsError) {
    throw new Error(\`Unable to load denied permissions: \${denialsError.message}\`);
  }

  const deniedPermissions = mapPermissionCodes(
    (denialsResult.data ?? []) as unknown as { permissions: { code: string } | null }[],
  );

  const allPermissions = Array.from(new Set([...rolePermissions, ...directPermissions]));
  const permissions = allPermissions.filter((p) => !deniedPermissions.includes(p));

  return { userId: user.id, email: user.email, memberId, roles, permissions };
}

export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!checkPermission(ctx.permissions, permission)) redirect("/access-denied");
  return ctx;
}

export async function requireAnyPermission(permissions: readonly Permission[]): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!checkAnyPermission(ctx.permissions, permissions)) redirect("/access-denied");
  return ctx;
}

export async function requireRole(role: AppRole): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!checkRole(ctx.roles, role)) redirect("/access-denied");
  return ctx;
}
`);