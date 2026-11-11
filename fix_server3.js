const fs = require("fs");
let c = fs.readFileSync("src/lib/auth/server.ts", "utf8");

// 1. Replace from "  if (roles.length) {" to "  return { userId: user.id, email: user.email, roles, permissions };"
const startMarker = "  if (roles.length) {";
const endMarker = "}";

const startIdx = c.indexOf(startMarker);
const endIdx = c.indexOf(endMarker, startIdx);

if (startIdx >= 0 && endIdx > startIdx) {
  // Find the closing '}' of the if block
  let braceCount = 0;
  let i = startIdx;
  for (; i < c.length; i++) {
    if (c[i] === '{') braceCount++;
    else if (c[i] === '}') braceCount--;
    if (braceCount === 0 && i > startIdx) break;
  }
  
  const endOfBlock = i + 1;
  
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

  c = c.substring(0, startIdx) + replacement + c.substring(endOfBlock);
  console.log("Old role loading block replaced (lines " + startIdx + " to " + endOfBlock + ")");
} else {
  console.log("Markers not found: start=" + startIdx + ", end=" + endIdx);
}

// 2. Replace hasPermissionServer
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
  console.log("hasPermissionServer replaced");
} else {
  console.log("hasPermissionServer NOT found - checking...");
  console.log("Has has_permission:", c.includes("has_permission"));
}

// 3. Replace hasRoleServer
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
  console.log("hasRoleServer replaced");
} else {
  console.log("hasRoleServer NOT found - checking...");
  console.log("Has has_role:", c.includes("has_role"));
}

fs.writeFileSync("src/lib/auth/server.ts", c, "utf8");
console.log("DONE");
console.log("HAS user_permission_denials:", c.includes("user_permission_denials"));
console.log("HAS user_roles:", c.includes("user_roles"));
console.log("HAS member_has_permission:", c.includes("member_has_permission"));
console.log("HAS member_has_role:", c.includes("member_has_role"));
console.log("HAS memberId in AuthContext:", c.includes("memberId: string | null"));