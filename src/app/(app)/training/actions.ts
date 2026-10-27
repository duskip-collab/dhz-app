"use server";

import { revalidatePath } from "next/cache";
import {
  createTraining,
  updateTraining,
  changeTrainingStatus,
  cancelTraining,
  deleteTraining,
  bulkUpdateAttendance,
  type TrainingStatus,
  type TrainingTargetGroup,
  type AttendanceStatus,
  type AttendanceEntry,
} from "@/lib/training/training.service";
import {
  validateCreateTraining,
  validateUpdateTraining,
  validateTrainingStatus,
  validateAttendanceList,
  isTrainingTargetGroup,
  isAttendanceStatus,
} from "@/features/training/schemas/training.validation";

export type TrainingActionState =
  | { ok: true; trainingId?: string }
  | { ok: false; errors: Record<string, string>; message: string };

function field(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}

function fail(message: string, errors: Record<string, string> = {}): TrainingActionState {
  return { ok: false, errors, message };
}

function handleError(e: unknown, fallback: string): TrainingActionState {
  const status = (e as { statusCode?: number }).statusCode ?? 500;
  if (status === 403) return fail("Nemáte oprávnenie.");
  if (status === 404) return fail("Tréning sa nenašiel.");
  if (status === 400) return fail(e instanceof Error ? e.message : "Neplatné údaje.");
  return fail(fallback);
}

// =============================================================================
// CREATE
// =============================================================================

export async function createTrainingAction(
  _prev: TrainingActionState | null,
  formData: FormData
): Promise<TrainingActionState> {
  const targetGroupRaw = field(formData, "target_group") ?? "ALL";
  if (!isTrainingTargetGroup(targetGroupRaw)) {
    return fail("Neplatná cieľová skupina.", { target_group: "Neplatná cieľová skupina." });
  }

  const input = {
    title: field(formData, "title") ?? "",
    description: field(formData, "description"),
    target_group: targetGroupRaw as TrainingTargetGroup,
    start_time: field(formData, "start_time") ?? "",
    end_time: field(formData, "end_time") ?? null,
    location: field(formData, "location"),
    trainer_id: field(formData, "trainer_id"),
  };

  const parsed = validateCreateTraining(input);
  if (!parsed.ok) {
    return fail("Skontrolujte zvýraznené polia.", parsed.errors);
  }

  try {
    const training = await createTraining(parsed.data);
    revalidatePath("/training");
    return { ok: true, trainingId: training.id };
  } catch (e) {
    return handleError(e, "Chyba pri vytváraní tréningu.");
  }
}

// =============================================================================
// UPDATE
// =============================================================================

export async function updateTrainingAction(
  trainingId: string,
  _prev: TrainingActionState | null,
  formData: FormData
): Promise<TrainingActionState> {
  const input: Record<string, string | null> = {};
  const title = field(formData, "title");
  if (title !== null) input.title = title;
  const description = field(formData, "description");
  if (description !== null) input.description = description;
  const targetGroup = field(formData, "target_group");
  if (targetGroup !== null) {
    if (!isTrainingTargetGroup(targetGroup)) {
      return fail("Neplatná cieľová skupina.", { target_group: "Neplatná cieľová skupina." });
    }
    input.target_group = targetGroup;
  }
  const startTime = field(formData, "start_time");
  if (startTime !== null) input.start_time = startTime;
  const endTime = field(formData, "end_time");
  if (endTime !== null) input.end_time = endTime;
  const location = field(formData, "location");
  if (location !== null) input.location = location;
  const trainerId = field(formData, "trainer_id");
  if (trainerId !== null) input.trainer_id = trainerId;

  const parsed = validateUpdateTraining(input);
  if (!parsed.ok) {
    return fail("Skontrolujte zvýraznené polia.", parsed.errors);
  }

  try {
    await updateTraining(trainingId, parsed.data);
    revalidatePath("/training");
    revalidatePath(`/training/${trainingId}`);
    return { ok: true, trainingId };
  } catch (e) {
    return handleError(e, "Chyba pri ukladaní tréningu.");
  }
}

// =============================================================================
// STATUS / CANCEL / DELETE
// =============================================================================

export async function changeTrainingStatusAction(
  trainingId: string,
  status: string
): Promise<TrainingActionState> {
  const parsed = validateTrainingStatus(status);
  if (!parsed.ok) {
    return fail("Neplatný stav tréningu.", parsed.errors);
  }

  try {
    await changeTrainingStatus(trainingId, parsed.data as TrainingStatus);
    revalidatePath("/training");
    revalidatePath(`/training/${trainingId}`);
    return { ok: true, trainingId };
  } catch (e) {
    return handleError(e, "Chyba pri zmene stavu tréningu.");
  }
}

export async function cancelTrainingAction(trainingId: string): Promise<TrainingActionState> {
  try {
    await cancelTraining(trainingId);
    revalidatePath("/training");
    revalidatePath(`/training/${trainingId}`);
    return { ok: true, trainingId };
  } catch (e) {
    return handleError(e, "Chyba pri rušení tréningu.");
  }
}

export async function deleteTrainingAction(trainingId: string): Promise<TrainingActionState> {
  try {
    await deleteTraining(trainingId);
    revalidatePath("/training");
    return { ok: true };
  } catch (e) {
    return handleError(e, "Chyba pri vymazaní tréningu.");
  }
}

// =============================================================================
// ATTENDANCE (bulk) – parallel arrays member_id[] / status[] / note[]
// =============================================================================

export async function updateAttendanceAction(
  trainingId: string,
  _prev: TrainingActionState | null,
  formData: FormData
): Promise<TrainingActionState> {
  const memberIds = formData.getAll("member_id").map((v) => String(v).trim());
  const statuses = formData.getAll("status").map((v) => String(v).trim());
  const notes = formData.getAll("note").map((v) => {
    const s = String(v).trim();
    return s.length === 0 ? null : s;
  });

  const list: AttendanceEntry[] = memberIds.map((member_id, i) => {
    const rawStatus = statuses[i] ?? "";
    return {
      member_id,
      status: (isAttendanceStatus(rawStatus) ? rawStatus : "ABSENT") as AttendanceStatus,
      note: notes[i] ?? null,
    };
  });

  const parsed = validateAttendanceList(list);
  if (!parsed.ok) {
    return fail("Skontrolujte údaje dochádzky.", parsed.errors);
  }

  try {
    await bulkUpdateAttendance(trainingId, parsed.data);
    revalidatePath(`/training/${trainingId}`);
    return { ok: true, trainingId };
  } catch (e) {
    return handleError(e, "Chyba pri ukladaní dochádzky.");
  }
}