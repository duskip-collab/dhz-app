"use server";

import { revalidatePath } from "next/cache";
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
    const ctx = await requirePermission(PERMISSIONS.TRAINING_VIEW);
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
    const memberAttendanceMap: Record<string, {
      totalTrainings: number;
      present: number;
      absent: number;
      excused: number;
      late: number;
      member: { id: string; first_name: string; last_name: string };
    }> = {};

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
      allMembers.forEach((m: any) => {
        memberAttendanceMap[m.id] = {
          totalTrainings: 0,
          present: 0,
          absent: 0,
          excused: 0,
          late: 0,
          member: { id: m.id, first_name: m.first_name, last_name: m.last_name },
        };
      });
    }

    // Spočítaj z attendance záznamov
    if (attendance) {
      attendance.forEach((a: any) => {
        const mid = a.member_id;
        if (memberAttendanceMap[mid]) {
          memberAttendanceMap[mid].totalTrainings += 1;
          const status = a.status;
          if (status === 'PRESENT') {
            memberAttendanceMap[mid].present += 1;
          } else if (status === 'ABSENT') {
            memberAttendanceMap[mid].absent += 1;
          } else if (status === 'EXCUSED') {
            memberAttendanceMap[mid].excused += 1;
          } else if (status === 'LATE') {
            memberAttendanceMap[mid].late += 1;
          }
        }
      });
    }

    // Spočítaj percentá a príprav data pre výstup
    const rows = Object.values(memberAttendanceMap).map((entry: any) => {
      const total = entry.totalTrainings;
      const participation = total > 0 ? (entry.present / total) * 100 : 0;
      return {
        ...entry,
        participation,
        absenceRate: total > 0 ? ((entry.absent + entry.excused + entry.late) / total) * 100 : 0,
      };
    });

    // Seďries podľa prítomnosti (nestrafo)
    rows.sort((a: any, b: any) => b.present - a.present);

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

    interface AttendanceSummaryData {
      generatedAt: string;
      totalMembers: number;
      totalTrainings: number;
      rows: AttendanceSummaryRow[];
    }

    const data: AttendanceSummaryData = {
      generatedAt: new Date().toISOString(),
      totalMembers: rows.length,
      totalTrainings: (trainings || []).length,
      rows: rows as AttendanceSummaryRow[],
    };

    return { ok: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Chyba pri generovaní súhrnu.';
    return { ok: false, error: message };
  }
}
// test append 2
