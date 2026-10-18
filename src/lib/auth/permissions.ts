export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  MEMBERS_VIEW: "members.view",
  MEMBERS_CREATE: "members.create",
  MEMBERS_EDIT: "members.edit",
  TRAINING_VIEW: "training.view",
  TRAINING_CREATE: "training.create",
  TRAINING_EDIT: "training.edit",
  COMPETITION_VIEW: "competition.view",
  COMPETITION_CREATE: "competition.create",
  COMPETITION_EDIT: "competition.edit",
  CALENDAR_VIEW: "calendar.view",
  CALENDAR_MANAGE: "calendar.manage",
  ANNOUNCEMENTS_VIEW: "announcements.view",
  ANNOUNCEMENTS_CREATE: "announcements.create",
  ANNOUNCEMENTS_EDIT: "announcements.edit",
  ANNOUNCEMENTS_DELETE: "announcements.delete",
  MEETINGS_VIEW: "meetings.view",
  MEETINGS_CREATE: "meetings.create",
  MEETINGS_EDIT: "meetings.edit",
  MEETINGS_DELETE: "meetings.delete",
  WORK_PARTIES_VIEW: "work_parties.view",
  WORK_PARTIES_CREATE: "work_parties.create",
  WORK_PARTIES_EDIT: "work_parties.edit",
  WORK_PARTIES_DELETE: "work_parties.delete",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_CREATE: "inventory.create",
  INVENTORY_EDIT: "inventory.edit",
  INVENTORY_MANAGE: "inventory.manage",
  INCIDENTS_VIEW: "incidents.view",
  INCIDENTS_CREATE: "incidents.create",
  INCIDENTS_EDIT: "incidents.edit",
  INCIDENTS_DELETE: "incidents.delete",
  VEHICLE_VIEW: "vehicle.view",
  VEHICLE_MANAGE: "vehicle.manage",
  FAULT_CREATE: "fault.create",
  FAULT_MANAGE: "fault.manage",
  INSPECTION_VIEW: "inspection.view",
  INSPECTION_MANAGE: "inspection.manage",
  FINANCE_VIEW: "finance.view",
  FINANCE_CREATE: "finance.create",
  FINANCE_EDIT: "finance.edit",
  FINANCE_EXPORT: "finance.export",
  FINANCE_MANAGE_ACCESS: "finance.manage_access",
  DOCUMENTS_VIEW: "documents.view",
  DOCUMENTS_UPLOAD: "documents.upload",
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",
  COMMUNICATION_VIEW: "communication.view",
  COMMUNICATION_SEND: "communication.send",
  ADMIN_USERS: "admin.users",
  ADMIN_PERMISSIONS: "admin.permissions",
  ADMIN_AUDIT: "admin.audit",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
const PERMISSION_VALUES: ReadonlySet<string> = new Set(Object.values(PERMISSIONS));

export function isPermission(permission: string): permission is Permission {
  return PERMISSION_VALUES.has(permission);
}

export function hasPermission(userPermissions: readonly string[], permission: Permission): boolean {
  return userPermissions.includes(permission);
}

export function hasAnyPermission(
  userPermissions: readonly string[],
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => userPermissions.includes(permission));
}

export function hasAllPermissions(
  userPermissions: readonly string[],
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => userPermissions.includes(permission));
}
