// Incident validation – ručná validácia bez externých závislostí (bez Zod)
// K12 – zodnáša sa po schéme 20261014_incidents_module.sql

import type {
  Incident,
  IncidentType,
  IncidentStatus,
  ResponderRole,
  CreateIncidentInput,
  UpdateIncidentInput,
  ResponderInput,
  EquipmentInput,
} from "@/types/incidents";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

const INCIDENT_TYPES: readonly IncidentType[] = [
  "FIRE",
  "TECHNICAL",
  "FLOOD",
  "TRAFFIC_ACCIDENT",
  "TACTICAL_EXERCISE",
  "OTHER",
];
const INCIDENT_STATUSES: readonly IncidentStatus[] = [
  "REPORTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];
const RESPONDER_ROLES: readonly ResponderRole[] = [
  "COMMANDER",
  "DRIVER",
  "FIREFIGHTER",
  "SUPPORT",
];

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

function parseDate(value: string | null | undefined): Date | null {
  if (isBlank(value)) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

export function isIncidentType(value: string): value is IncidentType {
  return (INCIDENT_TYPES as readonly string[]).includes(value);
}

export function isIncidentStatus(value: string): value is IncidentStatus {
  return (INCIDENT_STATUSES as readonly string[]).includes(value);
}

export function isResponderRole(value: string): value is ResponderRole {
  return (RESPONDER_ROLES as readonly string[]).includes(value);
}

// -----------------------------------------------------------------------------
// TIMELINE – chronologická postupnosť reported -> dispatched -> arrived -> returned
// -----------------------------------------------------------------------------

function validateTimeline(times: {
  reported?: Date | null;
  dispatched?: Date | null;
  arrived?: Date | null;
  returned?: Date | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const { reported, dispatched, arrived, returned } = times;
  if (reported && dispatched && dispatched < reported) {
    errors.dispatched_at = "Výjazd nemôže byť pred nahlásením.";
  }
  if (reported && arrived && arrived < reported) {
    errors.arrived_at = "Príchod nemôže byť pred nahlásením.";
  }
  if (dispatched && arrived && arrived < dispatched) {
    errors.arrived_at = "Príchod nemôže byť pred výjazdom.";
  }
  if (reported && returned && returned < reported) {
    errors.returned_at = "Návrat nemôže byť pred nahlásením.";
  }
  if (arrived && returned && returned < arrived) {
    errors.returned_at = "Návrat nemôže byť pred príchodom.";
  }
  return errors;
}

// -----------------------------------------------------------------------------
// CREATE INCIDENT
// -----------------------------------------------------------------------------

export function validateCreateIncident(input: CreateIncidentInput): ValidationResult<{
  incident_number: string | null;
  title: string;
  type: IncidentType;
  status: IncidentStatus;
  location: string;
  gps_coordinates: string | null;
  reported_at: string;
  dispatched_at: string | null;
  arrived_at: string | null;
  returned_at: string | null;
  description: string | null;
  command_notes: string | null;
  weather_conditions: string | null;
}> {
  const errors: Record<string, string> = {};

  const title = (input.title ?? "").trim();
  if (isBlank(title)) errors.title = "Názov zásahu je povinný.";
  else if (title.length > 200) errors.title = "Názov je príliš dlhý (max 200 znakov).";

  if (!isIncidentType(input.type)) errors.type = "Neplatný typ zásahu.";

  const status = input.status ?? "REPORTED";
  if (!isIncidentStatus(status)) errors.status = "Neplatný stav zásahu.";

  const location = (input.location ?? "").trim();
  if (isBlank(location)) errors.location = "Miesto zásahu je povinné.";

  const reportedAt = parseDate(input.reported_at ?? null) ?? new Date();
  const dispatchedAt = parseDate(input.dispatched_at ?? null);
  const arrivedAt = parseDate(input.arrived_at ?? null);
  const returnedAt = parseDate(input.returned_at ?? null);

  if (!isBlank(input.dispatched_at) && !dispatchedAt) errors.dispatched_at = "Neplatný dátum výjazdu.";
  if (!isBlank(input.arrived_at) && !arrivedAt) errors.arrived_at = "Neplatný dátum príchodu.";
  if (!isBlank(input.returned_at) && !returnedAt) errors.returned_at = "Neplatný dátum návratu.";

  Object.assign(
    errors,
    validateTimeline({ reported: reportedAt, dispatched: dispatchedAt, arrived: arrivedAt, returned: returnedAt })
  );

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      incident_number: trimOrNull(input.incident_number ?? null),
      title,
      type: input.type,
      status,
      location,
      gps_coordinates: trimOrNull(input.gps_coordinates ?? null),
      reported_at: reportedAt.toISOString(),
      dispatched_at: dispatchedAt ? dispatchedAt.toISOString() : null,
      arrived_at: arrivedAt ? arrivedAt.toISOString() : null,
      returned_at: returnedAt ? returnedAt.toISOString() : null,
      description: trimOrNull(input.description ?? null),
      command_notes: trimOrNull(input.command_notes ?? null),
      weather_conditions: trimOrNull(input.weather_conditions ?? null),
    },
  };
}


// -----------------------------------------------------------------------------
// UPDATE INCIDENT
// -----------------------------------------------------------------------------

export function validateUpdateIncident(
  input: UpdateIncidentInput,
  current?: {
    reported_at?: string;
    dispatched_at?: string | null;
    arrived_at?: string | null;
    returned_at?: string | null;
  }
): ValidationResult<Partial<Incident>> {
  const errors: Record<string, string> = {};
  const out: Partial<Incident> = {};

  if (input.incident_number !== undefined) out.incident_number = trimOrNull(input.incident_number);
  if (input.gps_coordinates !== undefined) out.gps_coordinates = trimOrNull(input.gps_coordinates);
  if (input.description !== undefined) out.description = trimOrNull(input.description);
  if (input.command_notes !== undefined) out.command_notes = trimOrNull(input.command_notes);
  if (input.weather_conditions !== undefined) out.weather_conditions = trimOrNull(input.weather_conditions);

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (isBlank(title)) errors.title = "Názov zásahu nesmie byť prázdny.";
    else if (title.length > 200) errors.title = "Názov je príliš dlhý (max 200 znakov).";
    else out.title = title;
  }

  if (input.type !== undefined) {
    if (!isIncidentType(input.type)) errors.type = "Neplatný typ zásahu.";
    else out.type = input.type;
  }

  if (input.status !== undefined) {
    if (!isIncidentStatus(input.status)) errors.status = "Neplatný stav zásahu.";
    else out.status = input.status;
  }

  if (input.location !== undefined) {
    const location = input.location.trim();
    if (isBlank(location)) errors.location = "Miesto zásahu nesmie byť prázdne.";
    else out.location = location;
  }

  const effReported =
    input.reported_at !== undefined ? parseDate(input.reported_at) : parseDate(current?.reported_at ?? null);
  const effDispatched =
    input.dispatched_at !== undefined ? parseDate(input.dispatched_at) : parseDate(current?.dispatched_at ?? null);
  const effArrived =
    input.arrived_at !== undefined ? parseDate(input.arrived_at) : parseDate(current?.arrived_at ?? null);
  const effReturned =
    input.returned_at !== undefined ? parseDate(input.returned_at) : parseDate(current?.returned_at ?? null);

  if (input.reported_at !== undefined) {
    if (!effReported) errors.reported_at = "Neplatný dátum nahlásenia.";
    else out.reported_at = effReported.toISOString();
  }
  if (input.dispatched_at !== undefined) {
    if (!effDispatched) errors.dispatched_at = "Neplatný dátum výjazdu.";
    else out.dispatched_at = effDispatched.toISOString();
  }
  if (input.arrived_at !== undefined) {
    if (!effArrived) errors.arrived_at = "Neplatný dátum príchodu.";
    else out.arrived_at = effArrived.toISOString();
  }
  if (input.returned_at !== undefined) {
    if (!effReturned) errors.returned_at = "Neplatný dátum návratu.";
    else out.returned_at = effReturned.toISOString();
  }

  Object.assign(
    errors,
    validateTimeline({
      reported: effReported,
      dispatched: effDispatched,
      arrived: effArrived,
      returned: effReturned,
    })
  );

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: out };
}

// -----------------------------------------------------------------------------
// RESPONDERS / EQUIPMENT lists
// -----------------------------------------------------------------------------

export function validateResponderList(
  list: ResponderInput[],
  existingMemberIds: ReadonlySet<string>
): ValidationResult<ResponderInput[]> {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();

  list.forEach((entry, index) => {
    const memberId = (entry.member_id ?? "").trim();
    if (isBlank(memberId)) {
      errors[`responders.${index}.member_id`] = "Chýba člen.";
    } else if (!existingMemberIds.has(memberId)) {
      errors[`responders.${index}.member_id`] = "Člen neexistuje.";
    } else if (seen.has(memberId)) {
      errors[`responders.${index}.member_id`] = "Člen už je priradený.";
    } else {
      seen.add(memberId);
    }
    if (!isResponderRole(entry.role)) {
      errors[`responders.${index}.role`] = "Neplatná rola.";
    }
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: list.map((e) => ({ member_id: e.member_id.trim(), role: e.role, notes: trimOrNull(e.notes) })),
  };
}

export function validateEquipmentList(
  list: EquipmentInput[],
  existingEquipmentIds: ReadonlySet<string>
): ValidationResult<EquipmentInput[]> {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();

  list.forEach((entry, index) => {
    const equipmentId = (entry.equipment_id ?? "").trim();
    if (isBlank(equipmentId)) {
      errors[`equipment.${index}.equipment_id`] = "Chýba technika.";
    } else if (!existingEquipmentIds.has(equipmentId)) {
      errors[`equipment.${index}.equipment_id`] = "Technika neexistuje.";
    } else if (seen.has(equipmentId)) {
      errors[`equipment.${index}.equipment_id`] = "Technika už je priradená.";
    } else {
      seen.add(equipmentId);
    }
    const hours = numberOrNull(entry.engine_hours_used);
    if (hours !== null && hours < 0) {
      errors[`equipment.${index}.engine_hours_used`] = "Motohodiny nemôžu byť záporné.";
    }
    const km = numberOrNull(entry.kilometers_driven);
    if (km !== null && km < 0) {
      errors[`equipment.${index}.kilometers_driven`] = "Kilometre nemôžu byť záporné.";
    }
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: list.map((e) => ({
      equipment_id: e.equipment_id.trim(),
      engine_hours_used: numberOrNull(e.engine_hours_used),
      kilometers_driven: numberOrNull(e.kilometers_driven),
      notes: trimOrNull(e.notes),
    })),
  };
}

