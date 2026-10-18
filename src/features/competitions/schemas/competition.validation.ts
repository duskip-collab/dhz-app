// Competition validation – ručná validácia bez externých závislostí (bez Zod)
// K10.2 – Competition Server Service & Actions
//
// Zodnáša sa po schéme K10.1 (20261010_competitions_module.sql):
//   competitions, competition_teams, competition_lineups

export type CompetitionCategory =
  | "MEN"
  | "WOMEN"
  | "DORAST_BOYS"
  | "DORAST_GIRLS"
  | "PLAMEN_BOYS"
  | "PLAMEN_GIRLS"
  | "MIX";

export type CompetitionStatus = "PLANNED" | "COMPLETED" | "CANCELLED";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

export interface CreateCompetitionInput {
  title: string;
  location?: string | null;
  date: string;
  end_time?: string | null;
  league?: string | null;
  category: CompetitionCategory;
  description?: string | null;
  organizer?: string | null;
}

export interface UpdateCompetitionInput {
  title?: string;
  location?: string | null;
  date?: string;
  end_time?: string | null;
  league?: string | null;
  category?: CompetitionCategory;
  description?: string | null;
  organizer?: string | null;
}

export interface CreateTeamInput {
  competition_id: string;
  name: string;
  result_time?: number | null;
  result_points?: number | null;
  rank?: number | null;
  note?: string | null;
}

export interface UpdateTeamInput {
  name?: string;
  result_time?: number | null;
  result_points?: number | null;
  rank?: number | null;
  note?: string | null;
}

export interface LineupEntry {
  member_id: string;
  position: string;
}

const CATEGORIES: readonly CompetitionCategory[] = [
  "MEN",
  "WOMEN",
  "DORAST_BOYS",
  "DORAST_GIRLS",
  "PLAMEN_BOYS",
  "PLAMEN_GIRLS",
  "MIX",
];
const STATUSES: readonly CompetitionStatus[] = ["PLANNED", "COMPLETED", "CANCELLED"];

// LIMITY zhodné so schémou: result_time numeric(6,2) -> max 9999.99
const MAX_RESULT_TIME = 9999.99;

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

export function isCompetitionCategory(value: string): value is CompetitionCategory {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function isCompetitionStatus(value: string): value is CompetitionStatus {
  return (STATUSES as readonly string[]).includes(value);
}

// numberOrNull – normalizuje vstup (string z formulára alebo číslo) na finite číslo.
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

// -----------------------------------------------------------------------------
// COMPETITION – CREATE
// -----------------------------------------------------------------------------

export function validateCreateCompetition(
  input: CreateCompetitionInput
): ValidationResult<{
  title: string;
  location: string | null;
  date: string;
  end_time: string | null;
  league: string | null;
  category: CompetitionCategory;
  description: string | null;
  organizer: string | null;
}> {
  const errors: Record<string, string> = {};

  const title = (input.title ?? "").trim();
  if (isBlank(title)) errors.title = "Názov súťaže je povinný.";
  else if (title.length > 200) errors.title = "Názov je príliš dlhý (max 200 znakov).";

  const category = (input.category ?? "") as CompetitionCategory;
  if (!isCompetitionCategory(category)) errors.category = "Neplatná kategória súťaže.";

  const date = parseDate(input.date);
  if (!date) errors.date = "Dátum súťaže je povinný a musí byť platný.";

  // end_time je voliteľný; ak je zadaný, musí byť platný a nie pred začiatkom.
  let end: Date | null = null;
  if (input.end_time !== undefined && input.end_time !== null && input.end_time.trim() !== "") {
    end = parseDate(input.end_time);
    if (!end) errors.end_time = "Neplatný dátum konca súťaže.";
  }
  if (date && end && end < date) {
    errors.end_time = "Koniec súťaže nemôže byť pred začiatkom.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      title,
      location: trimOrNull(input.location ?? null),
      date: (date as Date).toISOString(),
      end_time: end ? end.toISOString() : null,
      league: trimOrNull(input.league ?? null),
      category,
      description: trimOrNull(input.description ?? null),
      organizer: trimOrNull(input.organizer ?? null),
    },
  };
}

// -----------------------------------------------------------------------------
// COMPETITION – UPDATE
// -----------------------------------------------------------------------------

export function validateUpdateCompetition(
  input: UpdateCompetitionInput,
  current?: { date?: string; end_time?: string | null }
): ValidationResult<{
  title?: string;
  location?: string | null;
  date?: string;
  end_time?: string | null;
  league?: string | null;
  category?: CompetitionCategory;
  description?: string | null;
  organizer?: string | null;
}> {
  const errors: Record<string, string> = {};
  const out: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (isBlank(title)) errors.title = "Názov súťaže nesmie byť prázdny.";
    else if (title.length > 200) errors.title = "Názov je príliš dlhý (max 200 znakov).";
    else out.title = title;
  }

  if (input.location !== undefined) out.location = trimOrNull(input.location);
  if (input.league !== undefined) out.league = trimOrNull(input.league);
  if (input.description !== undefined) out.description = trimOrNull(input.description);
  if (input.organizer !== undefined) out.organizer = trimOrNull(input.organizer);

  if (input.category !== undefined) {
    if (!isCompetitionCategory(input.category)) errors.category = "Neplatná kategória súťaže.";
    else out.category = input.category;
  }

  let date: Date | null = null;
  if (input.date !== undefined) {
    date = parseDate(input.date);
    if (!date) errors.date = "Neplatný dátum súťaže.";
    else out.date = date.toISOString();
  }

  if (input.end_time !== undefined) {
    if (input.end_time === null) {
      out.end_time = null;
    } else {
      const parsed = parseDate(input.end_time);
      if (!parsed) errors.end_time = "Neplatný dátum konca súťaže.";
      else out.end_time = parsed.toISOString();
    }
  }

  // Cross-field: efektívny začiatok/koniec (nový alebo existujúci).
  const effStart = date ?? parseDate(current?.date ?? null);
  const effEndRaw =
    out.end_time !== undefined
      ? (out.end_time as string | null)
      : (current?.end_time ?? null);
  const effEnd = effEndRaw ? parseDate(effEndRaw) : null;
  if (effStart && effEnd && effEnd < effStart && !errors.date && !errors.end_time) {
    errors.end_time = "Koniec súťaže nemôže byť pred začiatkom.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, data: out as {
    title?: string;
    location?: string | null;
    date?: string;
    end_time?: string | null;
    league?: string | null;
    category?: CompetitionCategory;
    description?: string | null;
    organizer?: string | null;
  } };
}

// -----------------------------------------------------------------------------
// STATUS
// -----------------------------------------------------------------------------

export function validateCompetitionStatus(value: string): ValidationResult<CompetitionStatus> {
  if (!isCompetitionStatus(value)) {
    return { ok: false, errors: { status: "Neplatný stav súťaže." } };
  }
  return { ok: true, data: value };
}


// -----------------------------------------------------------------------------
// TEAM – CREATE
// -----------------------------------------------------------------------------

export function validateCreateTeam(input: CreateTeamInput): ValidationResult<{
  competition_id: string;
  name: string;
  result_time: number | null;
  result_points: number | null;
  rank: number | null;
  note: string | null;
}> {
  const errors: Record<string, string> = {};

  if (isBlank(input.competition_id)) errors.competition_id = "Chýba súťaž.";

  const name = (input.name ?? "").trim();
  if (isBlank(name)) errors.name = "Názov družstva je povinný.";
  else if (name.length > 200) errors.name = "Názov je príliš dlhý (max 200 znakov).";

  const resultTime = numberOrNull(input.result_time);
  if (resultTime !== null && (resultTime < 0 || resultTime > MAX_RESULT_TIME)) {
    errors.result_time = `Výsledný čas musí byť medzi 0 a ${MAX_RESULT_TIME}.`;
  }

  const resultPoints = numberOrNull(input.result_points);
  if (resultPoints !== null && !Number.isInteger(resultPoints)) {
    errors.result_points = "Body musia byť celé číslo.";
  }

  const rank = numberOrNull(input.rank);
  if (rank !== null && (!Number.isInteger(rank) || rank < 1)) {
    errors.rank = "Umiestnenie musí byť kladné celé číslo.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      competition_id: input.competition_id.trim(),
      name,
      result_time: resultTime,
      result_points: resultPoints,
      rank,
      note: trimOrNull(input.note ?? null),
    },
  };
}

// -----------------------------------------------------------------------------
// TEAM – UPDATE
// -----------------------------------------------------------------------------

export function validateUpdateTeam(input: UpdateTeamInput): ValidationResult<{
  name?: string;
  result_time?: number | null;
  result_points?: number | null;
  rank?: number | null;
  note?: string | null;
}> {
  const errors: Record<string, string> = {};
  const out: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (isBlank(name)) errors.name = "Názov družstva nesmie byť prázdny.";
    else if (name.length > 200) errors.name = "Názov je príliš dlhý (max 200 znakov).";
    else out.name = name;
  }

  if (input.result_time !== undefined) {
    const resultTime = numberOrNull(input.result_time);
    if (resultTime !== null && (resultTime < 0 || resultTime > MAX_RESULT_TIME)) {
      errors.result_time = `Výsledný čas musí byť medzi 0 a ${MAX_RESULT_TIME}.`;
    } else {
      out.result_time = resultTime;
    }
  }

  if (input.result_points !== undefined) {
    const resultPoints = numberOrNull(input.result_points);
    if (resultPoints !== null && !Number.isInteger(resultPoints)) {
      errors.result_points = "Body musia byť celé číslo.";
    } else {
      out.result_points = resultPoints;
    }
  }

  if (input.rank !== undefined) {
    const rank = numberOrNull(input.rank);
    if (rank !== null && (!Number.isInteger(rank) || rank < 1)) {
      errors.rank = "Umiestnenie musí byť kladné celé číslo.";
    } else {
      out.rank = rank;
    }
  }

  if (input.note !== undefined) out.note = trimOrNull(input.note);

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, data: out as {
    name?: string;
    result_time?: number | null;
    result_points?: number | null;
    rank?: number | null;
    note?: string | null;
  } };
}

// -----------------------------------------------------------------------------
// LINEUP – zoznam priradení členov (kontroly duplicít + existence člena)
// member_ids: množina existujúcich členov v DB (validuje existenciu)
// -----------------------------------------------------------------------------

export function validateLineupList(
  list: LineupEntry[],
  existingMemberIds: ReadonlySet<string>
): ValidationResult<LineupEntry[]> {
  const errors: Record<string, string> = {};
  if (!Array.isArray(list)) {
    return { ok: false, errors: { lineup: "Neplatná zostava." } };
  }

  const seenMember = new Set<string>();
  const seenPair = new Set<string>();

  list.forEach((entry, index) => {
    const memberId = (entry.member_id ?? "").trim();
    const position = (entry.position ?? "").trim();

    if (isBlank(memberId)) {
      errors[`lineup.${index}.member_id`] = "Chýba člen.";
    } else if (!existingMemberIds.has(memberId)) {
      errors[`lineup.${index}.member_id`] = "Člen neexistuje.";
    } else if (seenMember.has(memberId)) {
      errors[`lineup.${index}.member_id`] = "Člen už je v zostave priradený.";
    } else {
      seenMember.add(memberId);
    }

    if (isBlank(position)) {
      errors[`lineup.${index}.position`] = "Chýba pozícia.";
    } else {
      // DB obmedzenie: UNIQUE(team_id, member_id, position) – kontrolujeme pár member+position.
      const pairKey = `${memberId}::${position}`;
      if (seenPair.has(pairKey)) {
        errors[`lineup.${index}.position`] = "Duplicitné priradenie člena na pozíciu.";
      } else {
        seenPair.add(pairKey);
      }
    }
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: list.map((e) => ({
      member_id: e.member_id.trim(),
      position: e.position.trim(),
    })),
  };
}

