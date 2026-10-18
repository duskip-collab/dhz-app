// Competition Service - Server Authorization Layer
// K10.2 – Competition Server Service & Actions
//
// Bezpečné server-side operácie pre modul Súťaže a reprezentácia.
// Používa existujúcu architektúru: getAuthContext -> permission check -> Supabase RLS.
// RLS zostáva druhou bezpečnostnou vrstvou (defense-in-depth).
//
// Schéma: 20261010_competitions_module.sql (K10.1)
//   competitions, competition_teams, competition_lineups

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import {
  auditCompetitionCreate,
  auditCompetitionUpdate,
  auditCompetitionStatus,
  auditCompetitionTeam,
  auditCompetitionLineup,
} from "@/lib/audit/audit.service";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateCreateCompetition,
  validateUpdateCompetition,
  validateCompetitionStatus,
  validateCreateTeam,
  validateUpdateTeam,
  validateLineupList,
  type CreateCompetitionInput,
  type UpdateCompetitionInput,
  type CreateTeamInput,
  type UpdateTeamInput,
  type LineupEntry,
} from "@/features/competitions/schemas/competition.validation";

export type {
  CreateCompetitionInput,
  UpdateCompetitionInput,
  CreateTeamInput,
  UpdateTeamInput,
  LineupEntry,
} from "@/features/competitions/schemas/competition.validation";

// =============================================================================
// TYPY (zrkadlia schému K10.1)
// =============================================================================

export type CompetitionCategory =
  | "MEN"
  | "WOMEN"
  | "DORAST_BOYS"
  | "DORAST_GIRLS"
  | "PLAMEN_BOYS"
  | "PLAMEN_GIRLS"
  | "MIX";

export type CompetitionStatus = "PLANNED" | "COMPLETED" | "CANCELLED";

export interface Competition {
  id: string;
  title: string;
  location: string | null;
  date: string;
  end_time: string | null;
  league: string | null;
  category: CompetitionCategory;
  description: string | null;
  organizer: string | null;
  status: CompetitionStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CompetitionTeam {
  id: string;
  competition_id: string;
  name: string;
  result_time: number | null;
  result_points: number | null;
  rank: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface LineupMember {
  id: string;
  first_name: string;
  last_name: string;
  member_number: string;
}

export interface LineupRow {
  id: string;
  team_id: string;
  member_id: string;
  position: string;
  created_at: string;
  member: LineupMember | null;
}

export interface CompetitionTeamDetail extends CompetitionTeam {
  lineup: LineupRow[];
}

export interface CompetitionDetail extends Competition {
  teams: CompetitionTeamDetail[];
}

export interface ListCompetitionsParams {
  status?: CompetitionStatus;
  category?: CompetitionCategory;
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
 */
async function requireAuthenticated(): Promise<AuthContext> {
  try {
    const ctx = await getAuthContext();
    return ctx;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Unable to load authenticated user") ||
      message.includes("Session expired")
    ) {
      throw createAuthError(401, "Prihlásenie vypršalo alebo neplatí.");
    }
    throw error;
  }
}

/**
 * Overí permission z kontextu, s RPC fallbackom (defense-in-depth).
 */
async function assertPermission(ctx: AuthContext, permission: Permission): Promise<void> {
  const ok =
    ctx.permissions.includes(permission) || (await hasPermissionServer(ctx.userId, permission));
  if (!ok) {
    throw createAuthError(403, "Nemáte oprávnenie na túto operáciu.");
  }
}

// Konstantný SELECT pre detail súťaže (join na člena pre zostavu).
const LINEUP_SELECT =
  "*, member:members!competition_lineups_member_id_fkey(id, first_name, last_name, member_number)";

// =============================================================================
// READ – getCompetitions
// Vyžaduje `competition.view`. Filtrovanie podľa stavu/kategórie/dátumu + stránkovanie.
// =============================================================================

export async function getCompetitions(
  params: ListCompetitionsParams = {}
): Promise<Competition[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_VIEW);

  const supabase = await createClient();

  let query = supabase
    .from("competitions")
    .select("*")
    .order("date", { ascending: false });

  if (params.status) query = query.eq("status", params.status);
  if (params.category) query = query.eq("category", params.category);
  if (params.date_from) query = query.gte("date", params.date_from);
  if (params.date_to) query = query.lte("date", params.date_to);

  const limit = params.limit ?? 200;
  const offset = params.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    console.error("[getCompetitions] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní súťaží.");
  }

  return (data || []) as Competition[];
}

// =============================================================================
// READ – getCompetitionById
// Vyžaduje `competition.view`. Detail súťaže + družstvá + zostavy členov.
// =============================================================================

export async function getCompetitionById(competitionId: string): Promise<CompetitionDetail> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_VIEW);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("competitions")
    .select("*")
    .eq("id", competitionId)
    .single();

  if (error) {
    console.error("[getCompetitionById] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Súťaž sa nenašla.");
    throw createAuthError(500, "Chyba pri načítavaní súťaže.");
  }

  const { data: teams, error: teamsError } = await supabase
    .from("competition_teams")
    .select("*")
    .eq("competition_id", competitionId)
    .order("rank", { ascending: true, nullsFirst: false });

  if (teamsError) {
    console.error("[getCompetitionById] teams error:", teamsError);
    throw createAuthError(500, "Chyba pri načítavaní družstiev.");
  }

  const teamRows = (teams || []) as CompetitionTeam[];
  const teamsDetail: CompetitionTeamDetail[] = [];

  for (const team of teamRows) {
    const { data: lineup, error: lineupError } = await supabase
      .from("competition_lineups")
      .select(LINEUP_SELECT)
      .eq("team_id", team.id)
      .order("created_at", { ascending: true });

    if (lineupError) {
      console.error("[getCompetitionById] lineup error:", lineupError);
      throw createAuthError(500, "Chyba pri načítavaní zostáv.");
    }

    teamsDetail.push({
      ...team,
      lineup: (lineup || []) as LineupRow[],
    });
  }

  return {
    ...(data as Competition),
    teams: teamsDetail,
  };
}

// =============================================================================
// READ – getTeamLineup
// Vyžaduje `competition.view`. Zostava jedného družstva.
// =============================================================================

export async function getTeamLineup(teamId: string): Promise<LineupRow[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_VIEW);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competition_lineups")
    .select(LINEUP_SELECT)
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getTeamLineup] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní zostavy.");
  }

  return (data || []) as LineupRow[];
}


// =============================================================================
// CREATE – createCompetition
// Vyžaduje `competition.create`. Validuje vstup, zapisuje do DB + audit.
// =============================================================================

export async function createCompetition(input: CreateCompetitionInput): Promise<Competition> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_CREATE);

  const parsed = validateCreateCompetition(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje súťaže.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("competitions")
    .insert({
      ...parsed.data,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[createCompetition] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vytváraní súťaže.");
  }

  const competition = data as Competition;
  await auditCompetitionCreate(ctx.userId, competition);
  return competition;
}

// =============================================================================
// UPDATE – updateCompetition
// Vyžaduje `competition.edit`. Cross-field kontrola času proti aktuálnym hodnotám.
// =============================================================================

export async function updateCompetition(
  competitionId: string,
  input: UpdateCompetitionInput
): Promise<Competition> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_EDIT);

  const supabase = await createClient();

  const { data: existing, error: loadError } = await supabase
    .from("competitions")
    .select("date, end_time")
    .eq("id", competitionId)
    .single();

  if (loadError) {
    console.error("[updateCompetition] load error:", loadError);
    if (loadError.code === "PGRST116") throw createAuthError(404, "Súťaž sa nenašla.");
    throw createAuthError(500, "Chyba pri načítavaní súťaže.");
  }

  const parsed = validateUpdateCompetition(input, {
    date: existing.date,
    end_time: existing.end_time,
  });
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje súťaže.", parsed.errors);
  }

  const { data, error } = await supabase
    .from("competitions")
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq("id", competitionId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateCompetition] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladaní súťaže.");
  }

  const competition = data as Competition;
  await auditCompetitionUpdate(ctx.userId, competitionId, parsed.data);
  return competition;
}

// =============================================================================
// STATUS – changeCompetitionStatus
// Vyžaduje `competition.edit`. PLANNED -> COMPLETED | CANCELLED.
// =============================================================================

export async function changeCompetitionStatus(
  competitionId: string,
  status: CompetitionStatus
): Promise<Competition> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_EDIT);

  const parsed = validateCompetitionStatus(status);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatný stav súťaže.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("competitions")
    .update({ status: parsed.data, updated_by: ctx.userId })
    .eq("id", competitionId)
    .select("*")
    .single();

  if (error) {
    console.error("[changeCompetitionStatus] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Súťaž sa nenašla.");
    throw createAuthError(500, "Chyba pri zmene stavu súťaže.");
  }

  const competition = data as Competition;
  await auditCompetitionStatus(ctx.userId, competitionId, { status: parsed.data });
  return competition;
}


// =============================================================================
// TEAMS – CRUD
// Vytvorenie vyžaduje `competition.create`; úpravy/mazanie `competition.edit`.
// =============================================================================

export async function createTeam(input: CreateTeamInput): Promise<CompetitionTeam> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_CREATE);

  const parsed = validateCreateTeam(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje družstva.", parsed.errors);
  }

  const supabase = await createClient();

  // Overíme existenciu súťaže (404 handling + FK integrita).
  const { error: compError } = await supabase
    .from("competitions")
    .select("id")
    .eq("id", parsed.data.competition_id)
    .single();
  if (compError) {
    if (compError.code === "PGRST116") throw createAuthError(404, "Súťaž sa nenašla.");
    console.error("[createTeam] competition check error:", compError);
    throw createAuthError(500, "Chyba pri kontrole súťaže.");
  }

  const { data, error } = await supabase
    .from("competition_teams")
    .insert({
      ...parsed.data,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[createTeam] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vytváraní družstva.");
  }

  const team = data as CompetitionTeam;
  await auditCompetitionTeam(ctx.userId, "create", team.id, {
    competition_id: team.competition_id,
    name: team.name,
  });
  return team;
}

export async function updateTeam(
  teamId: string,
  input: UpdateTeamInput
): Promise<CompetitionTeam> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_EDIT);

  const parsed = validateUpdateTeam(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje družstva.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("competition_teams")
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq("id", teamId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateTeam] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Družstvo sa nenašlo.");
    throw createAuthError(500, "Chyba pri ukladaní družstva.");
  }

  const team = data as CompetitionTeam;
  await auditCompetitionTeam(ctx.userId, "update", teamId, parsed.data);
  return team;
}

export async function deleteTeam(teamId: string): Promise<{ id: string }> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_EDIT);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("competition_teams")
    .delete()
    .eq("id", teamId)
    .select("id, competition_id, name")
    .single();

  if (error) {
    console.error("[deleteTeam] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Družstvo sa nenašlo.");
    throw createAuthError(500, "Chyba pri mazaní družstva.");
  }

  await auditCompetitionTeam(ctx.userId, "delete", teamId, {
    competition_id: data.competition_id,
    name: data.name,
  });
  return { id: teamId };
}


// =============================================================================
// LINEUPS – priradenie členov do zostavy družstva
// Vyžaduje `competition.edit` (úprava zostáv).
//
// POZNÁMKA K TRANSAKCIÁM:
// Projekt nemá RPC ani transakčnú podporu v Supabase JS klientovi. setTeamLineup
// preto vykoná DELETE + INSERT ako sériu nezávislých zápisov. NIE JE to transakčne
// atomické – pri výpadku medzi operáciami môže zostať čiastočný stav. Pre plnú
// atomicitu by bola potrebná DB funkcia (RPC), ktorú K10.2 zámerne nevytvára
// (mimo rozsah). addLineupMember / removeLineupMember sú jednotlivé atómické zápisy.
// =============================================================================

async function existingMemberIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select("id");
  if (error) {
    console.error("[lineup] members load error:", error);
    throw createAuthError(500, "Chyba pri kontrole členov.");
  }
  return new Set(((data || []) as { id: string }[]).map((m) => m.id));
}

/** Pridá jedného člena na pozíciu (atomický INSERT). */
export async function addLineupMember(
  teamId: string,
  entry: LineupEntry
): Promise<LineupRow> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_EDIT);

  const memberIds = await existingMemberIds();
  const parsed = validateLineupList([entry], memberIds);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné priradenie člena.", parsed.errors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competition_lineups")
    .insert({
      team_id: teamId,
      member_id: parsed.data[0].member_id,
      position: parsed.data[0].position,
    })
    .select(LINEUP_SELECT)
    .single();

  if (error) {
    console.error("[addLineupMember] Supabase error:", error);
    // Unikátne obmedzenie (team_id, member_id, position)
    if (error.code === "23505") {
      throw createAuthError(409, "Člen už je na tejto pozícii priradený.");
    }
    throw createAuthError(500, "Chyba pri priradení člena.");
  }

  await auditCompetitionLineup(ctx.userId, teamId, {
    op: "add",
    member_id: parsed.data[0].member_id,
    position: parsed.data[0].position,
  });
  return data as LineupRow;
}

/** Odstráni jedno priradenie podľa id (atomický DELETE). */
export async function removeLineupMember(lineupId: string): Promise<{ id: string }> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_EDIT);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competition_lineups")
    .delete()
    .eq("id", lineupId)
    .select("id, team_id, member_id, position")
    .single();

  if (error) {
    console.error("[removeLineupMember] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Priradenie sa nenašlo.");
    throw createAuthError(500, "Chyba pri odstraňovaní priradenia.");
  }

  await auditCompetitionLineup(ctx.userId, data.team_id, {
    op: "remove",
    member_id: data.member_id,
    position: data.position,
  });
  return { id: lineupId };
}

/**
 * Nahradí celú zostavu družstva zadaným zoznamom.
 * POZOR: nie je transakčne atomické (DELETE + INSERT) – viď poznámku vyššie.
 */
export async function setTeamLineup(
  teamId: string,
  entries: LineupEntry[]
): Promise<LineupRow[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_EDIT);

  const memberIds = await existingMemberIds();
  const parsed = validateLineupList(entries, memberIds);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatná zostava.", parsed.errors);
  }

  const supabase = await createClient();

  // Overíme existenciu družstva.
  const { error: teamError } = await supabase
    .from("competition_teams")
    .select("id")
    .eq("id", teamId)
    .single();
  if (teamError) {
    if (teamError.code === "PGRST116") throw createAuthError(404, "Družstvo sa nenašlo.");
    console.error("[setTeamLineup] team check error:", teamError);
    throw createAuthError(500, "Chyba pri kontrole družstva.");
  }

  const { error: delError } = await supabase
    .from("competition_lineups")
    .delete()
    .eq("team_id", teamId);
  if (delError) {
    console.error("[setTeamLineup] delete error:", delError);
    throw createAuthError(500, "Chyba pri výmene zostavy.");
  }

  if (parsed.data.length === 0) {
    await auditCompetitionLineup(ctx.userId, teamId, { op: "replace", count: 0 });
    return [];
  }

  const rows = parsed.data.map((e) => ({
    team_id: teamId,
    member_id: e.member_id,
    position: e.position,
  }));

  const { data, error } = await supabase
    .from("competition_lineups")
    .insert(rows)
    .select(LINEUP_SELECT);

  if (error) {
    console.error("[setTeamLineup] insert error:", error);
    if (error.code === "23505") {
      throw createAuthError(409, "Konflikt priradenia člena na pozíciu.");
    }
    throw createAuthError(500, "Chyba pri ukladaní zostavy.");
  }

  await auditCompetitionLineup(ctx.userId, teamId, {
    op: "replace",
    count: parsed.data.length,
  });
  return (data || []) as LineupRow[];
}

// =============================================================================
// SAVE TEAM WITH LINEUP – create/update tímu + nahradenie zostavy v jednom volaní
// Vyžaduje `competition.edit`.
//
// ATOMICITA: Zápis tímu aj zostavy prebieha v jednej databázovej transakcii
// prostredníctvom RPC `save_team_with_lineup` (migrácia 20261011). Tým je
// vylúčené čiastočné uloženie (tím bez zostavy alebo naopak). Aplikácia naďalej
// vykonáva autorizáciu (competition.edit) a validáciu vstupu; RPC je
// SECURITY INVOKER, takže RLS politiky ostávajú aktívne, a existujúce audit
// triggery sa vypália v rámci rovnakej transakcie.
// =============================================================================

export interface SaveTeamInput {
  competition_id: string;
  name: string;
  result_time?: number | null;
  result_points?: number | null;
  rank?: number | null;
  note?: string | null;
}

export async function saveTeamWithLineup(
  teamId: string | null,
  teamData: SaveTeamInput,
  lineup: LineupEntry[]
): Promise<{ team: CompetitionTeam; lineup: LineupRow[] }> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.COMPETITION_EDIT);

  const supabase = await createClient();

  // 1) Validácia údajov tímu (create vs update) pred volaním RPC.
  let teamFields: {
    name: string;
    result_time: number | null;
    result_points: number | null;
    rank: number | null;
    note: string | null;
  };
  if (teamId) {
    const parsedTeam = validateUpdateTeam({
      name: teamData.name,
      result_time: teamData.result_time ?? null,
      result_points: teamData.result_points ?? null,
      rank: teamData.rank ?? null,
      note: teamData.note ?? null,
    });
    if (!parsedTeam.ok) {
      throw createAuthError(400, "Neplatné údaje družstva.", parsedTeam.errors);
    }
    teamFields = {
      name: parsedTeam.data.name as string,
      result_time: parsedTeam.data.result_time ?? null,
      result_points: parsedTeam.data.result_points ?? null,
      rank: parsedTeam.data.rank ?? null,
      note: parsedTeam.data.note ?? null,
    };
  } else {
    const parsedTeam = validateCreateTeam({
      competition_id: teamData.competition_id,
      name: teamData.name,
      result_time: teamData.result_time ?? null,
      result_points: teamData.result_points ?? null,
      rank: teamData.rank ?? null,
      note: teamData.note ?? null,
    });
    if (!parsedTeam.ok) {
      throw createAuthError(400, "Neplatné údaje družstva.", parsedTeam.errors);
    }
    teamFields = {
      name: parsedTeam.data.name,
      result_time: parsedTeam.data.result_time,
      result_points: parsedTeam.data.result_points,
      rank: parsedTeam.data.rank,
      note: parsedTeam.data.note,
    };
  }

  // 2) Validácia zostavy (existenciu členov, duplicity, prázdne vstupy).
  const memberIds = await existingMemberIds();
  const parsedLineup = validateLineupList(lineup, memberIds);
  if (!parsedLineup.ok) {
    throw createAuthError(400, "Neplatná zostava.", parsedLineup.errors);
  }

  const lineupJson = parsedLineup.data.map((e) => ({
    member_id: e.member_id,
    position: e.position,
  }));

  // 3) Atómový zápis cez RPC (jedna transakcia: tím + DELETE+INSERT zostavy).
  const { data: rpcTeamId, error: rpcError } = await supabase.rpc("save_team_with_lineup", {
    p_team_id: teamId,
    p_competition_id: teamData.competition_id,
    p_name: teamFields.name,
    p_result_time: teamFields.result_time,
    p_result_points: teamFields.result_points,
    p_rank: teamFields.rank,
    p_note: teamFields.note,
    p_lineup: lineupJson,
  });

  if (rpcError) {
    console.error("[saveTeamWithLineup] RPC error:", rpcError);
    if (rpcError.code === "42501") throw createAuthError(403, "Nemáte oprávnenie na túto operáciu.");
    if (rpcError.code === "P0002") throw createAuthError(404, "Družstvo sa nenašlo.");
    if (rpcError.code === "23505") throw createAuthError(409, "Konflikt priradenia člena na pozíciu.");
    if (rpcError.code === "23503") throw createAuthError(400, "Odkaz na neexistujúci záznam.");
    throw createAuthError(500, "Chyba pri ukladaní tímu a zostavy.");
  }

  const finalTeamId = rpcTeamId as string;

  // 4) Načítame výsledný stav pre návratovú hodnotu.
  const { data: teamRow, error: teamErr } = await supabase
    .from("competition_teams")
    .select("*")
    .eq("id", finalTeamId)
    .single();
  if (teamErr) {
    console.error("[saveTeamWithLineup] reload team error:", teamErr);
    throw createAuthError(500, "Chyba pri načítaní uloženého tímu.");
  }

  const { data: lineupRowsData, error: lineupErr } = await supabase
    .from("competition_lineups")
    .select(LINEUP_SELECT)
    .eq("team_id", finalTeamId)
    .order("created_at", { ascending: true });
  if (lineupErr) {
    console.error("[saveTeamWithLineup] reload lineup error:", lineupErr);
    throw createAuthError(500, "Chyba pri načítaní uloženej zostavy.");
  }

  return {
    team: teamRow as CompetitionTeam,
    lineup: (lineupRowsData || []) as LineupRow[],
  };
}



