const fs = require("fs");

// Part 3: hasPermissionServer and hasRoleServer
const part3 = `
export async function hasPermissionServer(memberId: string, permission: Permission): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "member_has_permission" as never,
    { p_member_id: memberId, p_permission_code: permission } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(\`Unable to check permission: \${error.message}\`);
  return data === true;
}

export async function hasRoleServer(memberId: string, role: AppRole): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "member_has_role" as never,
    { p_member_id: memberId, p_role_code: role } as never,
  ) as { data: boolean | null; error: Error | null };
  if (error) throw new Error(\`Unable to check role: \${error.message}\`);
  return data === true;
}
`;

fs.appendFileSync("src/lib/auth/server.ts", part3);
console.log("Part 3 written:", Buffer.byteLength(part3));

// Verify
const final = fs.readFileSync("src/lib/auth/server.ts", "utf8");
console.log("Final file length:", final.length);
console.log("Has user_roles:", final.includes("user_roles"));
console.log("Has has_permission RPC:", final.includes('"has_permission"'));
console.log("Has member_has_permission RPC:", final.includes('"member_has_permission"'));
console.log("Has member_has_role RPC:", final.includes('"member_has_role"'));
console.log("Has user_permission_denials:", final.includes("user_permission_denials"));
