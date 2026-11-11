const fs = require("fs");
let c = fs.readFileSync("src/lib/auth/server.ts", "utf8");

// 1. Replace remaining old denied permissions block
const oldDenials = `  // Efektívne oprávnenia = (opravnenia z rolí ∨ priame individuálne granty)
  //                        \\ explicitné odobratia (denials).
  // Musí byť konzistentné s public.has_permission() v databáze.
  let deniedPermissions: Permission[] = [];
  if (roles.length || directPermissions.length) {
    const deniedResult = await supabase
      .from("user_permission_denials")
      .select("permissions!user_permission_denials_permission_id_fkey(code)")
      .eq("user_id", user.id);
    if (deniedResult.error) {
      throw new Error(
        \`Unable to load denied permissions: \${deniedResult.error.message}\`,
      );
    }
    deniedPermissions = mapPermissionCodes(
      (deniedResult.data ?? []) as unknown as UserPermissionEmbedRow[],
    );
  }

  const allPermissions = Array.from(
    new Set([...rolePermissions, ...directPermissions]),
  );
  const permissions = allPermissions.filter(
    (p) => !deniedPermissions.includes(p),
  );

  return { userId: user.id, email: user.email, roles, permissions };
}`;

const newDenials = `  const { data: denialsResult, error: denialsError } = await supabase
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
}`;

if (c.includes(oldDenials)) {
  c = c.replace(oldDenials, newDenials);
  console.log("Denials block replaced");
} else {
  console.log("Denials block NOT found - checking partial...");
  if (c.includes("user_permission_denials")) {
    console.log("  Still has user_permission_denials reference");
  }
}

// 2. Replace hasPermissionServer and hasRoleServer
const oldHasPerm = `export async function hasPermissionServer(userId: string, permission: Permission): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "has_permission" as never,
    { p_user_id: userId, p_permission_code: permission } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(\`Unable to check permission: \${error.message}\`);
  return data === true;
}`;

const newHasPerm = `export async function hasPermissionServer(memberId: string, permission: Permission): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "member_has_permission" as never,
    { p_member_id: memberId, p_permission_code: permission } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(\`Unable to check permission: \${error.message}\`);
  return data === true;
}`;

if (c.includes(oldHasPerm)) {
  c = c.replace(oldHasPerm, newHasPerm);
  console.log("hasPermissionServer replaced");
} else {
  console.log("hasPermissionServer NOT found");
}

const oldHasRole = `export async function hasRoleServer(userId: string, role: AppRole): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "has_role" as never,
    { p_user_id: userId, p_role_code: role } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(\`Unable to check role: \${error.message}\`);
  return data === true;
}`;

const newHasRole = `export async function hasRoleServer(memberId: string, role: AppRole): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "member_has_role" as never,
    { p_member_id: memberId, p_role_code: role } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(\`Unable to check role: \${error.message}\`);
  return data === true;
}`;

if (c.includes(oldHasRole)) {
  c = c.replace(oldHasRole, newHasRole);
  console.log("hasRoleServer replaced");
} else {
  console.log("hasRoleServer NOT found");
}

fs.writeFileSync("src/lib/auth/server.ts", c, "utf8");
console.log("DONE - file written");
console.log("HAS user_roles now:", c.includes("user_roles"));
console.log("HAS member_has_permission now:", c.includes("member_has_permission"));
console.log("HAS member_has_role now:", c.includes("member_has_role"));