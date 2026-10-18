import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasRole as checkRole, type AppRole } from "./roles";
import {
  hasPermission as checkPermission,
  hasAnyPermission as checkAnyPermission,
  type Permission,
} from "./permissions";
import {
  mapPermissionCodes,
  mapRoleCodes,
  type RolePermissionEmbedRow,
  type UserPermissionEmbedRow,
  type UserRoleEmbedRow,
} from "./permissions-map";

export interface AuthContext {
  userId: string;
  email: string | undefined;
  roles: AppRole[];
  permissions: Permission[];
}

function isMissingAuthSessionError(error: { message?: string } | null): boolean {
  if (!error) return false;
  return error.message === "Auth session missing!";
}

/**
 * Server-side: nacita aktualneho usera + jeho role a permisies z DB.
 * Skutočná schéma (migrácia 20261006): tabuľky roles, permissions,
 * role_permissions(role_id, permission_id), user_roles(user_id, role_id),
 * user_permissions(user_id, permission_id) — všetko cez UUID FK + JOIN
 * na definition tabuľky; kódy sa čítajú z roles.code / permissions.code.
 * Chyba databázy → Error (nie redirect) — fail-closed, info v správe.
 * Ak nie je prihlaseny -> redirect na /login.
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

  const [userRolesResult, directPermissionsResult] = await Promise.all([
    supabase
      .from("user_roles")
      .select("roles!user_roles_role_id_fkey(code)")
      .eq("user_id", user.id),
    supabase
      .from("user_permissions")
      .select("permissions!user_permissions_permission_id_fkey(code)")
      .eq("user_id", user.id),
  ]);

  if (userRolesResult.error) {
    throw new Error(`Unable to load user roles: ${userRolesResult.error.message}`);
  }
  if (directPermissionsResult.error) {
    throw new Error(`Unable to load direct user permissions: ${directPermissionsResult.error.message}`);
  }

  const roles = mapRoleCodes(
    (userRolesResult.data ?? []) as unknown as UserRoleEmbedRow[],
  );

  const directPermissions = mapPermissionCodes(
    (directPermissionsResult.data ?? []) as unknown as UserPermissionEmbedRow[],
  );

  // Oprávnenia cez všetky role naraz: najprv UUID rolí podľa code,
  // potom jeden IN dotaz na role_permissions (join cez permission_id).
  let rolePermissions: Permission[] = [];
  if (roles.length) {
    const rolesResult = await supabase
      .from("roles")
      .select<"id">("id")
      .in("code", roles);
    if (rolesResult.error) {
      throw new Error(`Unable to load role ids: ${rolesResult.error.message}`);
    }
    // Supabase generovaný typ pre select("id") sa zdáva sa nezrovnať s reálnym
    // Row (id je tu potrebný); explicitný cast zabezpečuje typovú
    // bezpečnosť pri reálnom DB stave (UUID ids).
    const roleIds = ((rolesResult.data ?? []) as { id: string }[]).map(
      (r) => r.id,
    );
    if (roleIds.length) {
      const rolePermissionsResult = await supabase
        .from("role_permissions")
        .select("permissions!role_permissions_permission_id_fkey(code)")
        .in("role_id", roleIds);
      if (rolePermissionsResult.error) {
        throw new Error(
          `Unable to load role permissions: ${rolePermissionsResult.error.message}`,
        );
      }
      rolePermissions = mapPermissionCodes(
        (rolePermissionsResult.data ?? []) as unknown as RolePermissionEmbedRow[],
      );
    }
  }

  const permissions = Array.from(new Set([...rolePermissions, ...directPermissions]));

  return { userId: user.id, email: user.email, roles, permissions };
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

export async function hasPermissionServer(userId: string, permission: Permission): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "has_permission" as never,
    { p_user_id: userId, p_permission_code: permission } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(`Unable to check permission: ${error.message}`);
  return data === true;
}

export async function hasRoleServer(userId: string, role: AppRole): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "has_role" as never,
    { p_user_id: userId, p_role_code: role } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(`Unable to check role: ${error.message}`);
  return data === true;
}