const fs = require("fs");
let c = fs.readFileSync("src/lib/auth/server.ts", "utf8");
const lines = c.split("\n");

// Find the line with "const allPermissions" to understand the current state
let allPermissionsIdx = -1;
let returnIdx = -1;
let grantsQueryStart = -1;
let grantsAfterReturn = -1;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("const allPermissions")) allPermissionsIdx = i;
  if (line.includes("return { userId: user.id, email: user.email, memberId, roles, permissions }")) returnIdx = i;
  if (line.includes("member_permission_grants")) {
    if (line.includes("const { data: grantsResult")) grantsQueryStart = i;
    else if (line.includes("const data: grantsResult")) grantsAfterReturn = i;
  }
}

console.log("allPermissionsIdx:", allPermissionsIdx);
console.log("returnIdx:", returnIdx);
console.log("grantsQueryStart:", grantsQueryStart);
console.log("grantsAfterReturn:", grantsAfterReturn);

// The problem: grantsQueryEnd is after returnIdx
// Replace from grantsQueryStart to the end with the correct final section
const newEnd = [
  "  const { data: denialsResult, error: denialsError } = await supabase",
  '    .from("member_permission_denials")',
  '    .select("permissions!member_permission_denials_permission_id_fkey(code)")',
  '    .eq("member_id", memberId);',
  "",
  "  if (denialsError) {",
  '    throw new Error(`Unable to load denied permissions: ${denialsError.message}`);',
  "  }",
  "",
  "  const deniedPermissions = mapPermissionCodes(",
  '    (denialsResult.data ?? []) as unknown as { permissions: { code: string } | null }[],',
  "  );",
  "",
  "  const allPermissions = Array.from(new Set([...rolePermissions, ...directPermissions]));",
  "  const permissions = allPermissions.filter((p) => !deniedPermissions.includes(p));",
  "",
  "  return { userId: user.id, email: user.email, memberId, roles, permissions };",
];

c = c.substring(0, grantsAfterReturn) + newEnd.join("\n") + c.substring(c.indexOf("\n", c.indexOf("});")) + 1);

fs.writeFileSync("src/lib/auth/server.ts", c, "utf8");
console.log("DONE");
