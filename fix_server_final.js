const fs = require("fs");
let c = fs.readFileSync("src/lib/auth/server.ts", "utf8");

// Find the exact locations of the broken areas
const returnIdx = c.indexOf("return { userId: user.id, email: user.email, memberId, roles, permissions }");
const rolesLengthIdx = c.indexOf("if (roles.length) {", returnIdx);

if (returnIdx === -1 || rolesLengthIdx === -1) {
  console.log("FAIL: Markers not found");
  console.log("returnIdx:", returnIdx);
  console.log("rolesLengthIdx:", rolesLengthIdx);
  process.exit(1);
}

// Find the end of the if (roles.length) { block
let braceCount = 0;
let i = rolesLengthIdx;
for (; i < c.length; i++) {
  if (c[i] === "{") braceCount++;
  else if (c[i] === "}") {
    braceCount--;
    if (braceCount === 0) break;
  }
}
const endOfBlock = i + 1;

// Markers for the old helper functions
const oldHasPermStart = c.indexOf("export async function hasPermissionServer(userId: string");
const oldHasPermEnd = c.indexOf("}", c.indexOf("return data === true;", oldHasPermStart)) + 1;
if (oldHasPermStart === -1 || oldHasPermEnd === -1) {
  console.log("hasPermissionServer markers not found");
  process.exit(1);
}

const oldHasRoleStart = c.indexOf("export async function hasRoleServer(userId: string");
const oldHasRoleEnd = c.indexOf("}", c.indexOf("return data === true;", oldHasRoleStart)) + 1;
if (oldHasRoleStart === -1 || oldHasRoleEnd === -1) {
  console.log("hasRoleServer markers not found");
  process.exit(1);
}

// Replace the entire broken section
const replacement = `  const { data: grantsResult, error: grantsError } = await supabase
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

  return { userId: user.id, email: user.email, memberId, roles, permissions };`;

c = c.substring(0, rolesLengthIdx) + replacement + c.substring(endOfBlock);

// Replace hasPermissionServer
const oldHP = `export async function hasPermissionServer(userId: string, permission: Permission): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "has_permission" as never,
    { p_user_id: userId, p_permission_code: permission } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(\`Unable to check permission: \${error.message}\`);
  return data === true;
}`;

const newHP = `export async function hasPermissionServer(memberId: string, permission: Permission): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "member_has_permission" as never,
    { p_member_id: memberId, p_permission_code: permission } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(\`Unable to check permission: \${error.message}\`);
  return data === true;
}`;

if (c.includes(oldHP)) {
  c = c.replace(oldHP, newHP);
} else {
  console.log("WARNING: hasPermissionServer pattern not found");
}

// Replace hasRoleServer
const oldHR = `export async function hasRoleServer(userId: string, role: AppRole): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "has_role" as never,
    { p_user_id: userId, p_role_code: role } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(\`Unable to check role: \${error.message}\`);
  return data === true;
}`;

const newHR = `export async function hasRoleServer(memberId: string, role: AppRole): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "member_has_role" as never,
    { p_member_id: memberId, p_role_code: role } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(\`Unable to check role: \${error.message}\`);
  return data === true;
}`;

if (c.includes(oldHR)) {
  c = c.replace(oldHR, newHR);
} else {
  console.log("WARNING: hasRoleServer pattern not found");
}

fs.writeFileSync("src/lib/auth/server.ts", c, "utf8");

// Verify the changes
c = fs.readFileSync("src/lib/auth/server.ts", "utf8");
console.log("DONE");
console.log("Has user_permission_denials:", c.includes("user_permission_denials"));
console.log("Has user_roles:", c.includes("user_roles"));
console.log("Has member_has_permission:", c.includes("member_has_permission"));
console.log("Has member_has_role:", c.includes("member_has_role"));
console.log("Has has_permission RPC:", c.includes("\"has_permission\""));
console.log("Has member_has_permission RPC:", c.includes("\"member_has_permission\""));
console.log("Has return with memberId:", c.includes("memberId, roles, permissions"));
console.log("File length:", c.length);
