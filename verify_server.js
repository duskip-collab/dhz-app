const fs = require("fs");
const c = fs.readFileSync("src/lib/auth/server.ts", "utf8");
console.log("Has user_permission_denials:", c.includes("user_permission_denials"));
console.log("Has user_roles:", c.includes("user_roles"));
console.log("Has has_permission RPC:", c.includes('"has_permission"'));
console.log("Has member_has_permission RPC:", c.includes('"member_has_permission"'));
console.log("Has member_has_role RPC:", c.includes('"member_has_role"'));
console.log("File length:", c.length);
