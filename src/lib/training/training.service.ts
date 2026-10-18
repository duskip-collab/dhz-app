// Training Service - Server Authorization Layer
// K9.2 – Training Server Auth & Service Layer
//
// Bezpečné server-side operácie pre modul Tréningy a Dochádzka.
// Používa existujúcu architektúru: getAuthContext -> permission check -> Supabase RLS.
// RLS zostáva druhou bezpečnostnou vrstvou (defense-in-depth).

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import {
  auditTrainingCreate,
  auditTrainingUpdate,
  auditTrainingCancel,
  auditTrainingStatus,
  auditAttendanceUpdate,
} from "@/lib/audit/audit.service";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateCreateTraining,
  validateUpdateTraining,
  validateTrainingStatus,
  validateAttendanceList,
  type CreateTrainingInput,
  type UpdateTrainingInput,
  type AttendanceEntry,
} from "@/features/training/schemas/training.validation";

export type {
  CreateTrainingInput,
  UpdateTrainingInput,
  AttendanceEntry,
} from "@/features/training/schemas/training.validation";

// =============================================================================
// TYPY
// =============================================================================

export type TrainingTargetGroup = "ALL" | "ADULT" | "YOUTH" | "PREPARATORY" | "DORAST";
export type TrainingStatus = "PLANNED" | "COMPLETED" | "CANCELLED";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED" | "LATE";

export interface TrainerInfo {
  id: string;
  first_name: string;
  last_name: string;
  member_number: string;
}

export interface Training {
  id: string;
  title: string;
  description: string | null;
  target_group: TrainingTargetGroup;
  start_time: string;
  end_time: string;
  location: string | null;
  trainer_id: string | null;
  status: TrainingStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  trainer: TrainerInfo | null;
}

export interface AttendanceRecord {
  id: string;
  training_id: string;
  member_id: string;
  status: AttendanceStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceDetail extends AttendanceRecord {
  member: {
    id: string;
    first_name: string;
    last_name: string;
    member_number: string;
    membership_type: string;
  } | null;
}

export interface TrainingDetail extends Training {
  attendance: AttendanceRecord[];
}

export interface ListTrainingsParams {
  target_group?: TrainingTargetGroup;
  status?: TrainingStatus;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// AUTHENTICATION GUARD
// =============================================================================

/**
 * Authentication guard: overí, či je používateľ prihlásený.
 * Ak nie - vyhodí 401 chybu.
 */
async function requireAuthenticated(): Promise<AuthContext> {
  try {
    const ctx = await getAuthContext();
    return ctx;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unable to load authenticated user") || message.includes("Session expired")) {
      throw createAuthError(401, "Prihlásenie vypršalo alebo neplatí.");
    }
    throw error;
  }
}

/**
 * Overí permission z kontextu, s RPC fallbackom (defense-in-depth).
 */
async function assertPermission(ctx: AuthContext, permission: Permission): Promise<void> {
  const ok = ctx.permissions.includes(permission) || (await hasPermissionServer(ctx.userId, permission));
  if (!ok) {
    throw createAuthError(403, "Nemáte oprávnenie na túto operáciu.");
  }
}

// =============================================================================
// READ – getTrainings
// Vyžaduje `training.view`.
// =============================================================================

export async function getTrainings(params: ListTrainingsParams = {}): Promise<Training[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.TRAINING_VIEW);

  const supabase = await createClient();

  let query = supabase
    .from("trainings")
    .select("*, trainer:members!trainings_trainer_id_fkey(id, first_name, last_name, member_number)")
    .order("start_time", { ascending: false });

  if (params.target_group) query = query.eq("target_group", params.target_group);
  if (params.status) query = query.eq("status", params.status);
  if (params.date_from) query = query.gte("start_time", params.date_from);
  if (params.date_to) query = query.lte("start_time", params.date_to);

  const limit = params.limit ?? 200;
  const offset = params.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    console.error("[getTrainings] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní tréningov.");
  }

  return (data || []) as Training[];
}

// =============================================================================
// READ – getTrainingById
// Vyžaduje `training.view`. Načíta detail tréningu + dochádzku s detailmi členov.
// =============================================================================

export async function getTrainingById(trainingId: string): Promise<TrainingDetail> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.TRAINING_VIEW);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trainings")
    .select("*, trainer:members!trainings_trainer_id_fkey(id, first_name, last_name, member_number)")
    .eq("id", trainingId)
    .single();

  if (error) {
    console.error("[getTrainingById] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Tréning sa nenašiel.");
    throw createAuthError(500, "Chyba pri načítavaní tréningu.");
  }

  const { data: attendance, error: attError } = await supabase
    .from("training_attendance")
    .select("*")
    .eq("training_id", trainingId)
    .order("created_at", { ascending: true });

  if (attError) {
    console.error("[getTrainingById] attendance error:", attError);
    throw createAuthError(500, "Chyba pri načítavaní dochádzky.");
  }

  return {
    ...(data as Training),
    attendance: (attendance || []) as AttendanceRecord[],
  };
}

// =============================================================================
// CREATE – createTraining
// Vyžaduje `training.create`. Validuje vstup, zapisuje do DB + audit.
// =============================================================================

export async function createTraining(input: CreateTrainingInput): Promise<Training> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.TRAINING_CREATE);

  const parsed = validateCreateTraining(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje tréningu.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trainings")
    .insert({
      ...parsed.data,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("*, trainer:members!trainings_trainer_id_fkey(id, first_name, last_name, member_number)")
    .single();

  if (error) {
    console.error("[createTraining] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vytváraní tréningu.");
  }

  const training = data as Training;
  await auditTrainingCreate(ctx.userId, training);
  return training;
}

// =============================================================================
// UPDATE – updateTraining
// Vyžaduje `training.edit`. Cross-field kontrola času proti aktuálnym hodnotám.
// =============================================================================

export async function updateTraining(
  trainingId: string,
  input: UpdateTrainingInput
): Promise<Training> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.TRAINING_EDIT);

  const supabase = await createClient();

  // Načítame aktuálny záznam pre cross-field validáciu času a 404 handling.
  const { data: existing, error: loadError } = await supabase
    .from("trainings")
    .select("start_time, end_time")
    .eq("id", trainingId)
    .single();

  if (loadError) {
    console.error("[updateTraining] load error:", loadError);
    if (loadError.code === "PGRST116") throw createAuthError(404, "Tréning sa nenašiel.");
    throw createAuthError(500, "Chyba pri načítavaní tréningu.");
  }

  const parsed = validateUpdateTraining(input, {
    start_time: existing.start_time,
    end_time: existing.end_time,
  });
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje tréningu.", parsed.errors);
  }

  const { data, error } = await supabase
    .from("trainings")
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq("id", trainingId)
    .select("*, trainer:members!trainings_trainer_id_fkey(id, first_name, last_name, member_number)")
    .single();

  if (error) {
    console.error("[updateTraining] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladaní tréningu.");
  }

  const training = data as Training;
  await auditTrainingUpdate(ctx.userId, trainingId, parsed.data);
  return training;
}

// =============================================================================
// STATUS – changeTrainingStatus / cancelTraining
// Vyžaduje `training.edit`. PLANNED -> COMPLETED | CANCELLED.
// =============================================================================

export async function changeTrainingStatus(
  trainingId: string,
  status: TrainingStatus
): Promise<Training> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.TRAINING_EDIT);

  const parsed = validateTrainingStatus(status);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatný stav tréningu.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trainings")
    .update({ status: parsed.data, updated_by: ctx.userId })
    .eq("id", trainingId)
    .select("*, trainer:members!trainings_trainer_id_fkey(id, first_name, last_name, member_number)")
    .single();

  if (error) {
    console.error("[changeTrainingStatus] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Tréning sa nenašiel.");
    throw createAuthError(500, "Chyba pri zmene stavu tréningu.");
  }

  const training = data as Training;
  if (parsed.data === "CANCELLED") {
    await auditTrainingCancel(ctx.userId, trainingId, { status: "CANCELLED" });
  } else {
    await auditTrainingStatus(ctx.userId, trainingId, { status: parsed.data });
  }
  return training;
}

export async function cancelTraining(trainingId: string): Promise<Training> {
  return changeTrainingStatus(trainingId, "CANCELLED");
}

// =============================================================================
// ATTENDANCE – bulkUpdateAttendance
// Vyžaduje `training.edit`. Upsert (training_id, member_id) -> UNIQUE constraint.
// =============================================================================

export async function bulkUpdateAttendance(
  trainingId: string,
  list: AttendanceEntry[]
): Promise<AttendanceRecord[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.TRAINING_EDIT);

  const parsed = validateAttendanceList(list);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje dochádzky.", parsed.errors);
  }

  const supabase = await createClient();

  const rows = parsed.data.map((entry) => ({
    training_id: trainingId,
    member_id: entry.member_id,
    status: entry.status,
    note: entry.note,
  }));

  const { data, error } = await supabase
    .from("training_attendance")
    .upsert(rows, { onConflict: "training_id,member_id" })
    .select("*");

  if (error) {
    console.error("[bulkUpdateAttendance] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladaní dochádzky.");
  }

  const records = (data || []) as AttendanceRecord[];
  await auditAttendanceUpdate(ctx.userId, trainingId, {
    count: records.length,
    entries: parsed.data.map((e) => ({ member_id: e.member_id, status: e.status })),
  });
  return records;
}


