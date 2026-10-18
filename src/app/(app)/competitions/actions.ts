"use server";

import { revalidatePath } from "next/cache";
import {
  createCompetition,
  updateCompetition,
  changeCompetitionStatus,
  createTeam,
  updateTeam,
  deleteTeam,
  addLineupMember,
  removeLineupMember,
  setTeamLineup,
  saveTeamWithLineup,
  type CompetitionStatus,
  type CompetitionCategory,
  type LineupEntry,
} from "@/lib/competitions/competition.service";
import {
  validateCompetitionStatus,
  isCompetitionCategory,
} from "@/features/competitions/schemas/competition.validation";

export type CompetitionActionState =
  | { ok: true; competitionId?: string; teamId?: string }
  | { ok: false; errors: Record<string, string>; message: string };

function field(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}

function numField(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fail(message: string, errors: Record<string, string> = {}): CompetitionActionState {
  return { ok: false, errors, message };
}

function handleError(e: unknown, fallback: string): CompetitionActionState {
  const status = (e as { statusCode?: number }).statusCode ?? 500;
  if (status === 403) return fail("Nemáte oprávnenie.");
  if (status === 404) return fail("Záznam sa nenašiel.");
  if (status === 409) return fail(e instanceof Error ? e.message : "Konflikt údajov.");
  if (status === 400) return fail(e instanceof Error ? e.message : "Neplatné údaje.");
  return fail(fallback);
}

function detailsFrom(e: unknown): Record<string, string> {
  if (e && typeof e === "object" && "details" in e) {
    return (e as { details?: Record<string, string> }).details ?? {};
  }
  return {};
}

// =============================================================================
// CREATE
// =============================================================================

export async function createCompetitionAction(
  _prev: CompetitionActionState | null,
  formData: FormData
): Promise<CompetitionActionState> {
  const categoryRaw = field(formData, "category") ?? "";
  if (!isCompetitionCategory(categoryRaw)) {
    return fail("Neplatná kategória súťaže.", { category: "Neplatná kategória súťaže." });
  }

  const input = {
    title: field(formData, "title") ?? "",
    location: field(formData, "location"),
    date: field(formData, "date") ?? "",
    end_time: field(formData, "end_time"),
    league: field(formData, "league"),
    category: categoryRaw as CompetitionCategory,
    description: field(formData, "description"),
    organizer: field(formData, "organizer"),
  };

  try {
    const competition = await createCompetition(input);
    revalidatePath("/competitions");
    return { ok: true, competitionId: competition.id };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte zvýraznené polia.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri vytváraní súťaže.");
  }
}

// =============================================================================
// UPDATE
// =============================================================================

export async function updateCompetitionAction(
  competitionId: string,
  _prev: CompetitionActionState | null,
  formData: FormData
): Promise<CompetitionActionState> {
  const input: Record<string, string | null> = {};
  const title = field(formData, "title");
  if (title !== null) input.title = title;
  const location = field(formData, "location");
  if (location !== null) input.location = location;
  const date = field(formData, "date");
  if (date !== null) input.date = date;
  const endTime = field(formData, "end_time");
  if (endTime !== null) input.end_time = endTime;
  const league = field(formData, "league");
  if (league !== null) input.league = league;
  const description = field(formData, "description");
  if (description !== null) input.description = description;
  const organizer = field(formData, "organizer");
  if (organizer !== null) input.organizer = organizer;
  const category = field(formData, "category");
  if (category !== null) {
    if (!isCompetitionCategory(category)) {
      return fail("Neplatná kategória súťaže.", { category: "Neplatná kategória súťaže." });
    }
    input.category = category;
  }

  try {
    await updateCompetition(competitionId, input as never);
    revalidatePath("/competitions");
    revalidatePath(`/competitions/${competitionId}`);
    return { ok: true, competitionId };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte zvýraznené polia.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri ukladaní súťaže.");
  }
}

// =============================================================================
// STATUS
// =============================================================================

export async function changeCompetitionStatusAction(
  competitionId: string,
  status: string
): Promise<CompetitionActionState> {
  const parsed = validateCompetitionStatus(status);
  if (!parsed.ok) {
    return fail("Neplatný stav súťaže.", parsed.errors);
  }

  try {
    await changeCompetitionStatus(competitionId, parsed.data as CompetitionStatus);
    revalidatePath("/competitions");
    revalidatePath(`/competitions/${competitionId}`);
    return { ok: true, competitionId };
  } catch (e) {
    return handleError(e, "Chyba pri zmene stavu súťaže.");
  }
}

// =============================================================================
// TEAMS
// =============================================================================

export async function createTeamAction(
  competitionId: string,
  _prev: CompetitionActionState | null,
  formData: FormData
): Promise<CompetitionActionState> {
  const input = {
    competition_id: competitionId,
    name: field(formData, "name") ?? "",
    result_time: numField(formData, "result_time"),
    result_points: numField(formData, "result_points"),
    rank: numField(formData, "rank"),
    note: field(formData, "note"),
  };

  try {
    const team = await createTeam(input);
    revalidatePath(`/competitions/${competitionId}`);
    return { ok: true, competitionId, teamId: team.id };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte zvýraznené polia.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri vytváraní družstva.");
  }
}

export async function updateTeamAction(
  teamId: string,
  competitionId: string,
  _prev: CompetitionActionState | null,
  formData: FormData
): Promise<CompetitionActionState> {
  const input: Record<string, string | number | null> = {};
  const name = field(formData, "name");
  if (name !== null) input.name = name;
  if (formData.has("result_time")) input.result_time = numField(formData, "result_time");
  if (formData.has("result_points")) input.result_points = numField(formData, "result_points");
  if (formData.has("rank")) input.rank = numField(formData, "rank");
  const note = field(formData, "note");
  if (note !== null) input.note = note;

  try {
    await updateTeam(teamId, input as never);
    revalidatePath(`/competitions/${competitionId}`);
    return { ok: true, competitionId, teamId };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte zvýraznené polia.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri ukladaní družstva.");
  }
}

export async function deleteTeamAction(
  teamId: string,
  competitionId: string
): Promise<CompetitionActionState> {
  try {
    await deleteTeam(teamId);
    revalidatePath(`/competitions/${competitionId}`);
    return { ok: true, competitionId, teamId };
  } catch (e) {
    return handleError(e, "Chyba pri mazaní družstva.");
  }
}

// =============================================================================
// LINEUPS – zostava družstva
// =============================================================================

export async function addLineupMemberAction(
  teamId: string,
  competitionId: string,
  memberId: string,
  position: string
): Promise<CompetitionActionState> {
  try {
    await addLineupMember(teamId, { member_id: memberId, position });
    revalidatePath(`/competitions/${competitionId}`);
    return { ok: true, competitionId, teamId };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte priradenie.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri priradení člena.");
  }
}

export async function removeLineupMemberAction(
  lineupId: string,
  competitionId: string
): Promise<CompetitionActionState> {
  try {
    await removeLineupMember(lineupId);
    revalidatePath(`/competitions/${competitionId}`);
    return { ok: true, competitionId };
  } catch (e) {
    return handleError(e, "Chyba pri odstraňovaní priradenia.");
  }
}

// Nahradenie celej zostavy z paralelných polí member_id[] / position[].
export async function setTeamLineupAction(
  teamId: string,
  competitionId: string,
  _prev: CompetitionActionState | null,
  formData: FormData
): Promise<CompetitionActionState> {
  const memberIds = formData.getAll("member_id").map((v) => String(v).trim());
  const positions = formData.getAll("position").map((v) => String(v).trim());
  const entries: LineupEntry[] = memberIds.map((member_id, i) => ({
    member_id,
    position: positions[i] ?? "",
  }));

  try {
    await setTeamLineup(teamId, entries);
    revalidatePath(`/competitions/${competitionId}`);
    return { ok: true, competitionId, teamId };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte zostavu.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri ukladaní zostavy.");
  }
}

// =============================================================================
// SAVE TEAM WITH LINEUP – vytvorenie/úprava tímu + zostavy v jednom volaní
// teamId = null pre nový tím. Zostava z paralelných polí member_id[] / position[].
// =============================================================================

export async function saveTeamWithLineupAction(
  competitionId: string,
  teamId: string | null,
  _prev: CompetitionActionState | null,
  formData: FormData
): Promise<CompetitionActionState> {
  const teamData = {
    competition_id: competitionId,
    name: field(formData, "name") ?? "",
    result_time: numField(formData, "result_time"),
    result_points: numField(formData, "result_points"),
    rank: numField(formData, "rank"),
    note: field(formData, "note"),
  };

  const memberIds = formData.getAll("member_id").map((v) => String(v).trim());
  const positions = formData.getAll("position").map((v) => String(v).trim());
  const lineup: LineupEntry[] = memberIds.map((member_id, i) => ({
    member_id,
    position: positions[i] ?? "",
  }));

  try {
    const { team } = await saveTeamWithLineup(teamId, teamData, lineup);
    revalidatePath(`/competitions/${competitionId}`);
    return { ok: true, competitionId, teamId: team.id };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte zvýraznené polia.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri ukladaní tímu.");
  }
}

