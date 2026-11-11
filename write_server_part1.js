const fs = require("fs");

// Part 1: Imports and interface
const part1 = `import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasRole as checkRole, type AppRole } from "./roles";
import {
  hasPermission as checkPermission,
  hasAnyPermission as checkAnyPermission,
  type Permission,
} from "./permissions";
import { mapPermissionCodes } from "./permissions-map";

export interface AuthContext {
  userId: string;
  email: string | undefined;
  memberId: string | null;
  roles: AppRole[];
  permissions: Permission[];
}

function isMissingAuthSessionError(error: { message?: string } | null): boolean {
  if (!error) return false;
  return error.message === "Auth session missing!";
}
`;

fs.appendFileSync("src/lib/auth/server.ts", part1);
console.log("Part 1 written:", Buffer.byteLength(part1));
