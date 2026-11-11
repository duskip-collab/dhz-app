const fs = require("fs");

// Part 2: getAuthContext
parts.push(`export async function getAuthContext(): Promise<AuthContext> {
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
`);