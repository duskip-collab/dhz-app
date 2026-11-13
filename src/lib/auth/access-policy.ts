import { APP_ROLES, type AppRole } from "./roles.ts";
import { PERMISSIONS, type Permission } from "./permissions.ts";

export type MemberAccessDenial =
  | "forbidden"
  | "self_target"
  | "admin_role_restricted";

export function getMemberAccessDenial(input: {
  actorMemberId: string | null;
  targetMemberId: string;
  actorRoles: readonly AppRole[];
  actorPermissions: readonly Permission[];
  targetRole: AppRole;
}): MemberAccessDenial | null {
  if (
    !input.actorRoles.includes(APP_ROLES.ADMIN) &&
    !input.actorPermissions.includes(PERMISSIONS.ADMIN_USERS)
  ) {
    return "forbidden";
  }
  if (input.actorMemberId !== null && input.actorMemberId === input.targetMemberId) {
    return "self_target";
  }
  if (
    input.targetRole === APP_ROLES.ADMIN &&
    !input.actorRoles.includes(APP_ROLES.ADMIN)
  ) {
    return "admin_role_restricted";
  }
  return null;
}
