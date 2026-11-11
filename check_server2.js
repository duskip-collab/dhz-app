const fs = require("fs");
let c = fs.readFileSync("src/lib/auth/server.ts", "utf8");
const lines = c.split("\n");

console.log("=== SERVER.TS CONTENT CHECK ===");
console.log("Total lines:", lines.length);

// Search for specific patterns
const patterns = [
  "user_permission_denials",
  "user_roles",
  "has_permission",
  "has_role",
  "member_permission_grants",
  "member_has_permission",
  "member_has_role",
  "memberId: string | null",
  "memberId",
  "userId: user.id",
  "email: user.email",
  "return { userId"
];

for (const pattern of patterns) {
  const foundLines = [];
  lines.forEach((line, idx) => {
    if (line.includes(pattern)) {
      foundLines.push(idx + 1);
    }
  });
  console.log(pattern.padEnd(30) + " -> " + JSON.stringify(foundLines));
}

console.log("\n=== LINES 140-170 ===");
for (let i = 139; i < 170 && i < lines.length; i++) {
  console.log((i + 1) + " | " + lines[i]);
}
