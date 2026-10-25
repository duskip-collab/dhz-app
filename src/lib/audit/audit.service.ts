// Audit Service – Server-side logging for authorization-sensitive operations
// K8.2 – Members Server Auth & Permission Layer
//
// This service logs security-relevant events using the EXISTING O5 audit system.
//
// IMPORTANT:
// - Reuses existing `public.audit_log` table (append-only per O5)
// - Does NOT create a second production audit store
// - In-memory store is NOT used in production
// - Only used for testing if tests exist

import { createClient } from "@/lib/supabase/server";
import { AuthError } from "@/lib/members/members.errors";

// =============================================================================
// TYPY
// =============================================================================

export interface AuditEventData {
  module: string;
  action: string;
  entity_id: string | null;
  user_id: string | null;
  data: Record<string, unknown>;
}

// =============================================================================
// AUDIT ACTION NAMESPACES
// =============================================================================

export const AUDIT_ACTIONS = {
  // Members module
  CREATE: "members:create",
  READ: "members:read",
  UPDATE: "members:update",
  ARCHIVE: "members:archive",
  DELETE: "members:delete",
  LIST: "members:list",

  // Member guardians
  GUARDIAN_CREATE: "member_guardians:create",
  GUARDIAN_UPDATE: "member_guardians:update",
  GUARDIAN_DELETE: "member_guardians:delete",

  // Training module
  TRAINING_CREATE: "trainings:create",
  TRAINING_UPDATE: "trainings:update",
  TRAINING_CANCEL: "trainings:cancel",
  TRAINING_STATUS: "trainings:status",
  ATTENDANCE_UPDATE: "training_attendance:update",

  // Competitions module
  COMPETITION_CREATE: "competitions:create",
  COMPETITION_UPDATE: "competitions:update",
  COMPETITION_STATUS: "competitions:status",
  COMPETITION_TEAM_CREATE: "competition_teams:create",
  COMPETITION_TEAM_UPDATE: "competition_teams:update",
  COMPETITION_TEAM_DELETE: "competition_teams:delete",
  COMPETITION_LINEUP_UPDATE: "competition_lineups:update",

  // Equipment / Inventory module
  EQUIPMENT_CREATE: "equipment_items:create",
  EQUIPMENT_UPDATE: "equipment_items:update",
  EQUIPMENT_DISPOSE: "equipment_items:dispose",
  EQUIPMENT_ASSIGN: "equipment_assignments:assign",
  EQUIPMENT_RETURN: "equipment_assignments:return",
  EQUIPMENT_MAINTENANCE: "equipment_maintenance_logs:create",

  // Incidents & Operations module
  INCIDENT_CREATE: "incidents:create",
  INCIDENT_UPDATE: "incidents:update",
  INCIDENT_DELETE: "incidents:delete",

  // Calendar module
  CALENDAR_EVENT_CREATE: "calendar_events:create",
  CALENDAR_EVENT_UPDATE: "calendar_events:update",
  CALENDAR_EVENT_DELETE: "calendar_events:delete",

  // Announcements module
  ANNOUNCEMENT_CREATE: "announcements:create",
  ANNOUNCEMENT_UPDATE: "announcements:update",
  ANNOUNCEMENT_DELETE: "announcements:delete",

  // Meetings module
  MEETING_CREATE: "meetings:create",
  MEETING_UPDATE: "meetings:update",
  MEETING_DELETE: "meetings:delete",

  // Work Parties module
  WORK_PARTY_CREATE: "work_parties:create",
  WORK_PARTY_UPDATE: "work_parties:update",
  WORK_PARTY_DELETE: "work_parties:delete",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// =============================================================================
// AUDIT MODULE NAMESPACES
// =============================================================================

export const AUDIT_MODULES = {
  MEMBERS: "members",
  MEMBER_GUARDIANS: "member_guardians",
  TRAININGS: "trainings",
  TRAINING_ATTENDANCE: "training_attendance",
  COMPETITIONS: "competitions",
  COMPETITION_TEAMS: "competition_teams",
  COMPETITION_LINEUPS: "competition_lineups",
  EQUIPMENT_ITEMS: "equipment_items",
  EQUIPMENT_ASSIGNMENTS: "equipment_assignments",
  EQUIPMENT_MAINTENANCE_LOGS: "equipment_maintenance_logs",
  INCIDENTS: "incidents",
  CALENDAR_EVENTS: "calendar_events",
  ANNOUNCEMENTS: "announcements",
  MEETINGS: "meetings",
  WORK_PARTIES: "work_parties",
  USERS: "users",
  ROLES: "roles",
  PERMISSIONS: "permissions",
} as const;

export type AuditModule = (typeof AUDIT_MODULES)[keyof typeof AUDIT_MODULES];


// =============================================================================
// AUDIT SERVICE
// =============================================================================

/**
 * Service for logging audit events to the existing O5 `public.audit_log` table.
 *
 * This is the ONLY production audit mechanism. It does NOT create a second
 * audit store and does NOT keep events in memory.
 */
export async function logSecurityEvent(
  params: {
    userId: string | null;
    module: AuditModule;
    action: AuditAction;
    objectId: string | null;
    data: Record<string, unknown>;
  }
): Promise<void> {
  const supabase = await createClient();

  // Map our data to the existing audit_log columns
  // Columns: id, user_id, action, module, entity_id, old_data, new_data, created_at

  // We log the NEW state (new_data) for full audit trail
  // old_data is handled by the audit trigger in the database for UPDATE operations
  const { error } = await supabase
    .from("audit_log")
    .insert({
      user_id: params.userId,
      action: params.action,
      module: params.module,
      entity_id: params.objectId,
      new_data: JSON.stringify(params.data),
    } as never);

  if (error) {
    // Do NOT expose internal Supabase errors to the client
    // Log at server level only
    console.error("[AUDIT] Failed to insert audit log entry:", {
      module: params.module,
      action: params.action,
      entity_id: params.objectId,
      error: error.message,
      code: error.code,
    });
    throw new AuthError(500, "Unable to log security event.");
  }
}

/**
 * Convenience: Log member list access
 */
export async function auditMemberList(
  userId: string | null,
  params: { search?: string; limit?: number }
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.MEMBERS,
    action: AUDIT_ACTIONS.LIST,
    objectId: null,
    data: {
      search: params.search ?? null,
      limit: params.limit ?? null,
    },
  });
}

/**
 * Convenience: Log member read access
 */
export async function auditMemberRead(
  userId: string | null,
  memberId: string
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.MEMBERS,
    action: AUDIT_ACTIONS.READ,
    objectId: memberId,
    data: {},
  });
}

/**
 * Convenience: Log member creation
 */
export async function auditMemberCreate(
  userId: string | null,
  member: { id: string; member_number: string; first_name: string; last_name: string }
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.MEMBERS,
    action: AUDIT_ACTIONS.CREATE,
    objectId: member.id,
    data: {
      member_number: member.member_number,
      first_name: member.first_name,
      last_name: member.last_name,
    },
  });
}

/**
 * Convenience: Log member update
 */
export async function auditMemberUpdate(
  userId: string | null,
  memberId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.MEMBERS,
    action: AUDIT_ACTIONS.UPDATE,
    objectId: memberId,
    data,
  });
}

/**
 * Convenience: Log member archive
 */
export async function auditMemberArchive(
  userId: string | null,
  memberId: string
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.MEMBERS,
    action: AUDIT_ACTIONS.ARCHIVE,
    objectId: memberId,
    data: {},
  });
}

/**
 * Convenience: Log member guardian creation
 */
export async function auditMemberGuardianCreate(
  userId: string | null,
  memberId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.MEMBER_GUARDIANS,
    action: AUDIT_ACTIONS.GUARDIAN_CREATE,
    objectId: memberId,
    data,
  });
}

/**
 * Convenience: Log member guardian update
 */
export async function auditMemberGuardianUpdate(
  userId: string | null,
  memberId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.MEMBER_GUARDIANS,
    action: AUDIT_ACTIONS.GUARDIAN_UPDATE,
    objectId: memberId,
    data,
  });
}

/**
 * Convenience: Log member guardian deletion
 */
export async function auditMemberGuardianDelete(
  userId: string | null,
  memberId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.MEMBER_GUARDIANS,
    action: AUDIT_ACTIONS.GUARDIAN_DELETE,
    objectId: memberId,
    data,
  });
}

// =============================================================================
// TRAINING MODULE AUDIT HELPERS
// =============================================================================

/** Convenience: Log training creation */
export async function auditTrainingCreate(
  userId: string | null,
  training: { id: string; title: string; target_group: string; start_time: string }
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.TRAININGS,
    action: AUDIT_ACTIONS.TRAINING_CREATE,
    objectId: training.id,
    data: {
      title: training.title,
      target_group: training.target_group,
      start_time: training.start_time,
    },
  });
}

/** Convenience: Log training update */
export async function auditTrainingUpdate(
  userId: string | null,
  trainingId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.TRAININGS,
    action: AUDIT_ACTIONS.TRAINING_UPDATE,
    objectId: trainingId,
    data,
  });
}

/** Convenience: Log training cancellation */
export async function auditTrainingCancel(
  userId: string | null,
  trainingId: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.TRAININGS,
    action: AUDIT_ACTIONS.TRAINING_CANCEL,
    objectId: trainingId,
    data,
  });
}

/** Convenience: Log training status change */
export async function auditTrainingStatus(
  userId: string | null,
  trainingId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.TRAININGS,
    action: AUDIT_ACTIONS.TRAINING_STATUS,
    objectId: trainingId,
    data,
  });
}

/** Convenience: Log bulk attendance update */
export async function auditAttendanceUpdate(
  userId: string | null,
  trainingId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.TRAINING_ATTENDANCE,
    action: AUDIT_ACTIONS.ATTENDANCE_UPDATE,
    objectId: trainingId,
    data,
  });
}

// =============================================================================
// COMPETITIONS MODULE AUDIT HELPERS
// =============================================================================

/** Convenience: Log competition creation */
export async function auditCompetitionCreate(
  userId: string | null,
  competition: { id: string; title: string; category: string; date: string }
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.COMPETITIONS,
    action: AUDIT_ACTIONS.COMPETITION_CREATE,
    objectId: competition.id,
    data: {
      title: competition.title,
      category: competition.category,
      date: competition.date,
    },
  });
}

/** Convenience: Log competition update */
export async function auditCompetitionUpdate(
  userId: string | null,
  competitionId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.COMPETITIONS,
    action: AUDIT_ACTIONS.COMPETITION_UPDATE,
    objectId: competitionId,
    data,
  });
}

/** Convenience: Log competition status change */
export async function auditCompetitionStatus(
  userId: string | null,
  competitionId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.COMPETITIONS,
    action: AUDIT_ACTIONS.COMPETITION_STATUS,
    objectId: competitionId,
    data,
  });
}

/** Convenience: Log competition team create/update/delete */
export async function auditCompetitionTeam(
  userId: string | null,
  action: "create" | "update" | "delete",
  teamId: string,
  data: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    create: AUDIT_ACTIONS.COMPETITION_TEAM_CREATE,
    update: AUDIT_ACTIONS.COMPETITION_TEAM_UPDATE,
    delete: AUDIT_ACTIONS.COMPETITION_TEAM_DELETE,
  } as const;
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.COMPETITION_TEAMS,
    action: actionMap[action],
    objectId: teamId,
    data,
  });
}

/** Convenience: Log competition lineup (roster) assignment change */
export async function auditCompetitionLineup(
  userId: string | null,
  teamId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.COMPETITION_LINEUPS,
    action: AUDIT_ACTIONS.COMPETITION_LINEUP_UPDATE,
    objectId: teamId,
    data,
  });
}

// =============================================================================
// EQUIPMENT / INVENTORY MODULE AUDIT HELPERS
// =============================================================================

/** Convenience: Log equipment item create/update */
export async function auditEquipmentItem(
  userId: string | null,
  action: "create" | "update" | "dispose",
  itemId: string,
  data: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    create: AUDIT_ACTIONS.EQUIPMENT_CREATE,
    update: AUDIT_ACTIONS.EQUIPMENT_UPDATE,
    dispose: AUDIT_ACTIONS.EQUIPMENT_DISPOSE,
  } as const;
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.EQUIPMENT_ITEMS,
    action: actionMap[action],
    objectId: itemId,
    data,
  });
}

/** Convenience: Log equipment assignment (assign / return) */
export async function auditEquipmentAssignment(
  userId: string | null,
  action: "assign" | "return",
  assignmentId: string,
  data: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    assign: AUDIT_ACTIONS.EQUIPMENT_ASSIGN,
    return: AUDIT_ACTIONS.EQUIPMENT_RETURN,
  } as const;
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.EQUIPMENT_ASSIGNMENTS,
    action: actionMap[action],
    objectId: assignmentId,
    data,
  });
}

/** Convenience: Log equipment maintenance log creation */
export async function auditEquipmentMaintenance(
  userId: string | null,
  equipmentId: string,
  data: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.EQUIPMENT_MAINTENANCE_LOGS,
    action: AUDIT_ACTIONS.EQUIPMENT_MAINTENANCE,
    objectId: equipmentId,
    data,
  });
}

// =============================================================================
// INCIDENTS & OPERATIONS MODULE AUDIT HELPERS
// =============================================================================

/** Convenience: Log incident create/update/delete */
export async function auditIncident(
  userId: string | null,
  action: "create" | "update" | "delete",
  incidentId: string,
  data: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    create: AUDIT_ACTIONS.INCIDENT_CREATE,
    update: AUDIT_ACTIONS.INCIDENT_UPDATE,
    delete: AUDIT_ACTIONS.INCIDENT_DELETE,
  } as const;
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.INCIDENTS,
    action: actionMap[action],
    objectId: incidentId,
    data,
  });
}

// =============================================================================
// CALENDAR MODULE AUDIT HELPERS
// =============================================================================

/** Convenience: Log calendar event create/update/delete */
export async function auditCalendarEvent(
  userId: string | null,
  action: "create" | "update" | "delete",
  eventId: string,
  data: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    create: AUDIT_ACTIONS.CALENDAR_EVENT_CREATE,
    update: AUDIT_ACTIONS.CALENDAR_EVENT_UPDATE,
    delete: AUDIT_ACTIONS.CALENDAR_EVENT_DELETE,
  } as const;
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.CALENDAR_EVENTS,
    action: actionMap[action],
    objectId: eventId,
    data,
  });
}

// =============================================================================
// ANNOUNCEMENTS MODULE AUDIT HELPERS
// =============================================================================

/** Convenience: Log announcement create/update/delete */
export async function auditAnnouncement(
  userId: string | null,
  action: "create" | "update" | "delete",
  announcementId: string,
  data: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    create: AUDIT_ACTIONS.ANNOUNCEMENT_CREATE,
    update: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATE,
    delete: AUDIT_ACTIONS.ANNOUNCEMENT_DELETE,
  } as const;
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.ANNOUNCEMENTS,
    action: actionMap[action],
    objectId: announcementId,
    data,
  });
}

// =============================================================================
// MEETINGS MODULE AUDIT HELPERS
// =============================================================================

/** Convenience: Log meeting create/update/delete */
export async function auditMeeting(
  userId: string | null,
  action: "create" | "update" | "delete",
  meetingId: string,
  data: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    create: AUDIT_ACTIONS.MEETING_CREATE,
    update: AUDIT_ACTIONS.MEETING_UPDATE,
    delete: AUDIT_ACTIONS.MEETING_DELETE,
  } as const;
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.MEETINGS,
    action: actionMap[action],
    objectId: meetingId,
    data,
  });
}

// =============================================================================
// WORK PARTIES MODULE AUDIT HELPERS
// =============================================================================

/** Convenience: Log work party create/update/delete */
export async function auditWorkParty(
  userId: string | null,
  action: "create" | "update" | "delete",
  workPartyId: string,
  data: Record<string, unknown>
): Promise<void> {
  const actionMap = {
    create: AUDIT_ACTIONS.WORK_PARTY_CREATE,
    update: AUDIT_ACTIONS.WORK_PARTY_UPDATE,
    delete: AUDIT_ACTIONS.WORK_PARTY_DELETE,
  } as const;
  await logSecurityEvent({
    userId,
    module: AUDIT_MODULES.WORK_PARTIES,
    action: actionMap[action],
    objectId: workPartyId,
    data,
  });
}

// =============================================================================
// TESTING ONLY – No production store
// =============================================================================

// NOTE: No in-memory store is maintained here.
// Audit events are written directly to the database.
// Tests that need to assert audit events must query the database directly.

/**
 * Testing helper: Get audit events from the database (for tests)
 */
export async function getAuditEvents(): Promise<
  Array<{
    id: string;
    user_id: string | null;
    action: string;
    module: string;
    entity_id: string | null;
    old_data: unknown | null;
    new_data: unknown | null;
    created_at: string;
  }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[AUDIT] Failed to fetch audit events:", error);
    return [];
  }
  return data || [];
}

/**
 * Testing helper: Clear audit events (for tests only)
 * WARNING: Clearing the audit log should only be allowed in test environments.
 */
