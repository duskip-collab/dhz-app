const fs = require("fs");

// Part 2: getAuthContext function
const part2 = `
/**
 * Server-side: načita aktuálneho usera + jeho rolu a oprávnenia z členského modelu.
 *
 * Tok:
 *   auth.uid() → members.auth_user_id → members.id → member_access_profiles
 *                                        → member_permission_grants
 *                                        → member_permission_denials
 *
 * Efektívne oprávnenia = (Role permissions ∪ Individual GRANT) \ Individual DENY
 * Výsledok musí byť konzistentný s public.member_has_permission() v databáze.
 *
 * Chyba databázy → Error (nie redirect) — fail-closed, info v správe.
 * Ak nie je prihlásený -> redirect na /login.
 * Ak nemá členský profil -> roles = [], permissions = [] (žiadne automatické oprávnenia).
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

  // 1. Najdi člena podľa auth_user_id
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (memberError) {
    throw new Error(\`Unable to load member profile: \${memberError.message}\`);
  }

  const memberId = member?.id ?? null;

  // Ak člen nemá prepojený účet, nemá žiadne rolu ani oprávnenia.
  if (!memberId) {
    return { userId: user.id, email: user.email, memberId: null, roles: [], permissions: [] };
  }

  // 2. Načítaj členský prístupový profil (rola)
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

  // 3. Načítaj individuálne granty (členom-viazané)
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

  // 4. Načítaj individuálne odobratia (členom-viazané)
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
`;

fs.appendFileSync("src/lib/auth/server.ts", part2);
console.log("Part 2 written:", Buffer.byteLength(part2));
