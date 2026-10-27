// Training validation – ručná validácia bez externých závislostí (bez Zod)
// K9.2 – Training Server Auth & Service Layer

export type TrainingTargetGroup = "ALL" | "ADULT" | "YOUTH" | "PREPARATORY" | "DORAST";
export type TrainingStatus = "PLANNED" | "COMPLETED" | "CANCELLED";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED" | "LATE";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

export interface CreateTrainingInput {
  title: string;
  description?: string | null;
  target_group?: TrainingTargetGroup;
  start_time: string;
  end_time?: string | null;
  location?: string | null;
  trainer_id?: string | null;
}

export interface UpdateTrainingInput {
  title?: string;
  description?: string | null;
  target_group?: TrainingTargetGroup;
  start_time?: string;
  end_time?: string;
  location?: string | null;
  trainer_id?: string | null;
}

export interface AttendanceEntry {
  member_id: string;
  status: AttendanceStatus;
  note?: string | null;
}

const TARGET_GROUPS: readonly TrainingTargetGroup[] = ["ALL", "ADULT", "YOUTH", "PREPARATORY", "DORAST"];
const TRAINING_STATUSES: readonly TrainingStatus[] = ["PLANNED", "COMPLETED", "CANCELLED"];
const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ["PRESENT", "ABSENT", "EXCUSED", "LATE"];

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

export function isTrainingTargetGroup(value: string): value is TrainingTargetGroup {
  return (TARGET_GROUPS as readonly string[]).includes(value);
}

export function isTrainingStatus(value: string): value is TrainingStatus {
  return (TRAINING_STATUSES as readonly string[]).includes(value);
}

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

// -----------------------------------------------------------------------------
// CREATE
// -----------------------------------------------------------------------------

export function validateCreateTraining(input: CreateTrainingInput): ValidationResult<{
  title: string;
  description: string | null;
  target_group: TrainingTargetGroup;
  start_time: string;
  end_time: string;
  location: string | null;
  trainer_id: string | null;
}> {
  const errors: Record<string, string> = {};

  const title = (input.title ?? "").trim();
  if (isBlank(title)) errors.title = "Názov tréningu je povinný.";
  else if (title.length > 200) errors.title = "Názov je príliš dlhý (max 200 znakov).";

  const targetGroup = (input.target_group ?? "ALL") as TrainingTargetGroup;
  if (!isTrainingTargetGroup(targetGroup)) {
    errors.target_group = "Neplatná cieľová skupina.";
  }

  const start = parseDate(input.start_time);
  if (!start) errors.start_time = "Začiatok tréningu je povinný a musí byť platný dátum.";

  let end: Date | null = null;
  if (!isBlank(input.end_time)) {
    end = parseDate(input.end_time);
    if (!end) errors.end_time = "Koniec tréningu musí byť platný dátum.";
  }

  if (start && end && end <= start) {
    errors.end_time = "Koniec tréningu musí byť po začiatku.";
  }

  const trainerId = trimOrNull(input.trainer_id ?? null);
  if (input.trainer_id !== null && input.trainer_id !== undefined && trainerId === null) {
    errors.trainer_id = "Neplatný tréner.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      title,
      description: trimOrNull(input.description ?? null),
      target_group: targetGroup,
      start_time: (start as Date).toISOString(),
      end_time: end ? (end as Date).toISOString() : null,
      location: trimOrNull(input.location ?? null),
      trainer_id: trainerId,
    },
  };
}

// -----------------------------------------------------------------------------
// UPDATE
// -----------------------------------------------------------------------------

export function validateUpdateTraining(
  input: UpdateTrainingInput,
  current?: { start_time?: string; end_time?: string }
): ValidationResult<{
  title?: string;
  description?: string | null;
  target_group?: TrainingTargetGroup;
  start_time?: string;
  end_time?: string;
  location?: string | null;
  trainer_id?: string | null;
}> {
  const errors: Record<string, string> = {};
  const out: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (isBlank(title)) errors.title = "Názov tréningu nesmie byť prázdny.";
    else if (title.length > 200) errors.title = "Názov je príliš dlhý (max 200 znakov).";
    else out.title = title;
  }

  if (input.description !== undefined) out.description = trimOrNull(input.description);

  if (input.target_group !== undefined) {
    if (!isTrainingTargetGroup(input.target_group)) errors.target_group = "Neplatná cieľová skupina.";
    else out.target_group = input.target_group;
  }

  let start: Date | null = null;
  if (input.start_time !== undefined) {
    start = parseDate(input.start_time);
    if (!start) errors.start_time = "Neplatný dátum začiatku.";
    else out.start_time = start.toISOString();
  }

  let end: Date | null = null;
  if (input.end_time !== undefined) {
    end = parseDate(input.end_time);
    if (!end) errors.end_time = "Neplatný dátum konca.";
    else out.end_time = end.toISOString();
  }

  if (input.location !== undefined) out.location = trimOrNull(input.location);

  if (input.trainer_id !== undefined) {
    const trainerId = trimOrNull(input.trainer_id);
    if (input.trainer_id !== null && trainerId === null) {
      errors.trainer_id = "Neplatný tréner.";
    } else {
      out.trainer_id = trainerId;
    }
  }

  // Cross-field time check: if both provided, or one provided + existing current
  const effStart = start ?? parseDate(current?.start_time ?? null);
  const effEnd = end ?? parseDate(current?.end_time ?? null);
  if (effStart && effEnd && effEnd <= effStart && !errors.start_time && !errors.end_time) {
    errors.end_time = "Koniec tréningu musí byť po začiatku.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: out as {
      title?: string;
      description?: string | null;
      target_group?: TrainingTargetGroup;
      start_time?: string;
      end_time?: string;
      location?: string | null;
      trainer_id?: string | null;
    },
  };
}

// -----------------------------------------------------------------------------
// STATUS
// -----------------------------------------------------------------------------

export function validateTrainingStatus(value: string): ValidationResult<TrainingStatus> {
  if (!isTrainingStatus(value)) {
    return { ok: false, errors: { status: "Neplatný stav tréningu." } };
  }
  return { ok: true, data: value };
}

// -----------------------------------------------------------------------------
// ATTENDANCE (bulk)
// -----------------------------------------------------------------------------

export function validateAttendanceList(
  list: AttendanceEntry[]
): ValidationResult<AttendanceEntry[]> {
  const errors: Record<string, string> = {};
  if (!Array.isArray(list)) {
    return { ok: false, errors: { attendance: "Neplatný zoznam dochádzky." } };
  }
  if (list.length === 0) {
    return { ok: false, errors: { attendance: "Zoznam dochádzky je prázdny." } };
  }

  const seen = new Set<string>();
  list.forEach((entry, index) => {
    if (isBlank(entry.member_id)) {
      errors[`attendance.${index}.member_id`] = "Chýba člen.";
    } else if (seen.has(entry.member_id)) {
      errors[`attendance.${index}.member_id`] = "Duplicitný člen v zozname.";
    } else {
      seen.add(entry.member_id);
    }
    if (!isAttendanceStatus(entry.status)) {
      errors[`attendance.${index}.status`] = "Neplatný stav dochádzky.";
    }
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: list.map((e) => ({
      member_id: e.member_id,
      status: e.status,
      note: trimOrNull(e.note ?? null),
    })),
  };
}

