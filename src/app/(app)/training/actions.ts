"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAuthError } from "@/lib/members/members.errors";
import {
  createTraining,
  updateTraining,
  changeTrainingStatus,
  cancelTraining,
  deleteTraining,
  bulkUpdateAttendance,
  getTrainingExportData,
  type TrainingStatus,
  type TrainingTargetGroup,
  type AttendanceStatus,
  type AttendanceEntry,
} from "@/lib/training/training.service";
import type { Database } from "@/types/database.types";
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

interface AttendanceSummaryRow {
  memberId: string;
  firstName: string;
  lastName: string;
  totalTrainings: number;
  present: number;
  absent: number;
  excused: number;
  late: number;
  participation: number;
  absenceRate: number;
}

interface AttendanceSummaryCounts {
  totalTrainings: number;
  present: number;
  absent: number;
  excused: number;
  late: number;
  member: Pick<
    Database["public"]["Tables"]["members"]["Row"],
    "id" | "first_name" | "last_name"
  >;
}

type AttendanceSummaryMember = Pick<
  Database["public"]["Tables"]["members"]["Row"],
  "id" | "first_name" | "last_name"
>;

type AttendanceSummaryAttendance = Pick<
  Database["public"]["Tables"]["training_attendance"]["Row"],
  "member_id" | "status"
>;

interface AttendanceSummaryData {
  generatedAt: string;
  totalMembers: number;
  totalTrainings: number;
  rows: AttendanceSummaryRow[];
}

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

// =============================================================================
// EXPORT – exportTrainingAttendanceAction
// Vyžaduje `training.view`. Čítacia operácia – žiadny zápis do databázy.
// Slúži pre export CSV a tlač prezenčnej listiny.
// =============================================================================

export async function exportTrainingAttendanceAction(
  trainingId: string
): Promise<
  | { ok: true; data: Awaited<ReturnType<typeof getTrainingExportData>> }
  | { ok: false; error: string }
> {
  try {
    const data = await getTrainingExportData(trainingId);
    return { ok: true, data };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Chyba pri načítaní údajov na export.";
    return { ok: false, error: message };
  }
}// test append
// =============================================================================
// SUMMARY – generateAttendanceSummaryAction
// Vyžaduje 	raining.view. Čítacia operácia – žiadny zápis do DB.
// Vráti prehľad účasti členov naprieč všetkými tréningmi.
// =============================================================================

export async function generateAttendanceSummaryAction(): Promise<
  | { ok: true; data: AttendanceSummaryData }
  | { ok: false; error: string }
> {
  try {
    await requirePermission(PERMISSIONS.TRAINING_VIEW);
    const supabase = await createClient();

    // Načítaj všetky tréningy s ich Dochádzkou
    const { data: trainings, error: trainingsError } = await supabase
      .from('trainings')
      .select('*, trainer:members!trainings_trainer_id_fkey(id, first_name, last_name)')
      .order('start_time', { ascending: true });

    if (trainingsError) {
      console.error('[generateAttendanceSummary] trainings error:', trainingsError);
      throw createAuthError(500, 'Chyba pri načítaní tréningov.');
    }

    // Načítaj všetky záznamy Docházky s member joinom
    const { data: attendance, error: attendanceError } = await supabase
      .from('training_attendance')
      .select('*, member:members!training_attendance_member_id_fkey(id, first_name, last_name)');

    if (attendanceError) {
      console.error('[generateAttendanceSummary] attendance error:', attendanceError);
      throw createAuthError(500, 'Chyba pri načítaní Dochážky.');
    }

    // Skupina podľa member_id a spočítaj stavové počty
    const memberAttendanceMap: Record<string, AttendanceSummaryCounts> = {};

    // Inicializácia zoznamu členov z tabuľky members (aktívni)
    const { data: allMembers, error: membersError } = await supabase
      .from('members')
      .select('id, first_name, last_name')
      .eq('status', 'active');

    if (membersError) {
      console.error('[generateAttendanceSummary] members error:', membersError);
      throw createAuthError(500, 'Chyba pri načítaní členov.');
    }

    // Inicializácia mapy pre všetkých členov
    if (allMembers) {
      for (const member of allMembers as AttendanceSummaryMember[]) {
        memberAttendanceMap[member.id] = {
          totalTrainings: 0,
          present: 0,
          absent: 0,
          excused: 0,
          late: 0,
          member,
        };
      }
    }

    // Spočítaj z attendance záznamov
    if (attendance) {
      for (const record of attendance as AttendanceSummaryAttendance[]) {
        const memberAttendance = memberAttendanceMap[record.member_id];
        if (!memberAttendance) continue;

        memberAttendance.totalTrainings += 1;
        if (record.status === "PRESENT") {
          memberAttendance.present += 1;
        } else if (record.status === "ABSENT") {
          memberAttendance.absent += 1;
        } else if (record.status === "EXCUSED") {
          memberAttendance.excused += 1;
        } else if (record.status === "LATE") {
          memberAttendance.late += 1;
        }
      }
    }

    // Spočítaj percentá a príprav data pre výstup
    const rows: AttendanceSummaryRow[] = Object.values(memberAttendanceMap).map((entry) => {
      const total = entry.totalTrainings;
      return {
        memberId: entry.member.id,
        firstName: entry.member.first_name,
        lastName: entry.member.last_name,
        totalTrainings: total,
        present: entry.present,
        absent: entry.absent,
        excused: entry.excused,
        late: entry.late,
        participation: total > 0 ? (entry.present / total) * 100 : 0,
        absenceRate: total > 0 ? ((entry.absent + entry.excused + entry.late) / total) * 100 : 0,
      };
    });

    // Seďries podľa prítomnosti (nestrafo)
    rows.sort((a, b) => b.present - a.present);

    const data: AttendanceSummaryData = {
      generatedAt: new Date().toISOString(),
      totalMembers: rows.length,
      totalTrainings: (trainings || []).length,
      rows,
    };

    return { ok: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Chyba pri generovaní súhrnu.';
    return { ok: false, error: message };
  }
}
// test append 2
