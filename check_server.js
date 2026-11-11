const fs = require("fs");
let c = fs.readFileSync("src/lib/auth/server.ts", "utf8");
console.log("FILE LENGTH:", c.length);
console.log("HAS user_roles:", c.includes("user_roles"));
console.log("HAS member_access_profiles:", c.includes("member_access_profiles"));
console.log("HAS member_permission_grants:", c.includes("member_permission_grants"));
console.log("HAS has_permission RPC:", c.includes("has_permission"));
console.log("HAS member_has_permission RPC:", c.includes("member_has_permission"));