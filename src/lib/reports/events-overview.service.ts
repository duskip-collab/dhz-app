// Events Overview Report — Server Service
// K13.3.4 – Prevádzkové reporty (Udalosti, tréningy a akcie DHZ)
//
// Serverová implementácia reportu `events-overview` (Prehľad udalostí,
// tréningov a akcií DHZ). Zdroj: `trainings` + `competitions` (jednotný
// kalendár) + počty účastníkov z `training_attendance` / `competition_teams`.
// Žiadna tabuľka `events` neexistuje (overené v `database.types.ts`).
//
// Finančné údaje (rozpočty akcií, náhrady, odmeny) sa tu NIKDY nečítajú.
// Bezpečnostný model (defense-in-depth):
//   1) `getAuthContext()` overí prihlásenie (neprihlásený → redirect /login),
//   2) explicitná AND kontrola — report vyžaduje `reports.view` **A**
//      `calendar.view`. `reports.view` samotné NESTAČÍ (pozri katalóg),
//   3) čítanie prebieha cez štandardný serverový Supabase klient (RLS) —
//      NEPOUŽÍVA service-role, neobchádza RLS.
//
// POZNÁMKA k oprávneniu (K13.3.4 — odchýlka od zadania, zdôvodnená):
//   Zadanie požadovalo `events.view`, tento kľúč VŠAK v repozitári NEEXISTUJE
//   (0 zhôd v `src/**` aj vo všetkých `supabase/migrations/*.sql`; tabuľka
//   `permissions` ho neobsahuje). Pridanie nového kľúča by vyžadovalo zákaznú
//   migráciu a len TS konštanta by `has_permission()` nikdy nevrátila true
//   (report by bol trvalo zamietnutý). Použilo sa preto existujúce
//   `calendar.view` — oprávnenie, ktoré už pôvodný katalógový záznam
//   `calendar-events` deklaroval a ktoré semantic zodpovedá „udalostiam".
//
// POZNÁMKA k RLS (známy nesúlad — neopravovaný): RLS `trainings` a
//   `training_attendance` vyžaduje `training.view`, RLS `competitions` a
//   `competition_teams` vyžaduje `competition.view`. Používateľ s
//   `calendar.view`, ale BEZ `training.view`/`competition.view`, prejde
//   aplikáciou, no RLS mu vráti PRÁZDNY výsledok (fail-closed, žiadny únik).
//   Všetky roly s `reports.view` (VEDENIE, VELITEL, ADMIN) majú aj oba zdrojové
//   oprávnenia → v praxi vidia kompletné dáta; POKLADNIK (calendar.view bez
//   training/competition.view) dostane prázdny stav. Bezpečné, zdokumentované.

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermissionServer } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { createAuthError } from "@/lib/members/members.errors";
import {
  summarizeEvents,
  type EventSummaryRow,
  type EventsOverviewSummary,
  type EventType,
} from "./reports.core";

// Pre-re-export typu pre UI (stránka importuje summary typ odtiaľto).
export type { EventsOverviewSummary, EventType } from "./reports.core";

/** Oprávnenia potrebné na tento report (logika AND). */
const EVENTS_OVERVIEW_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.CALENDAR_VIEW,
];

/** Jednotný riadok udalosti pre UI tabuľku (len ne-finančné polia). */
export interface EventItem {
  id: string;
  type: EventType;
  title: string;
  /** Dátum ako `YYYY-MM-DD` (z `trainings.start_time` alebo `competitions.date`). */
  date: string;
  location: string | null;
  status: string;
  /** Počet účastníkov (tréning: záznamy dochádzky; súťaž: prihlásené družstvá). */
  participants: number;
}

/** Kompletný výsledok reportu: súhrn + riadky pre tabuľku. */
export interface EventsOverviewReport {
  summary: EventsOverviewSummary;
  events: readonly EventItem[];
}

/**
 * Overí, že prihlásený používateľ má VŠETKY oprávnenia reportu.
 * Kontrola je AND — chýbajúce hociktoré oprávnenie = zamietnutie.
 * Defense-in-depth: okrem kontextu sa overí aj cez RPC `has_permission`.
 */
async function authorizeEventsOverview(): Promise<void> {
  const ctx = await getAuthContext();

  const missing = EVENTS_OVERVIEW_PERMISSIONS.filter(
    (permission) => !ctx.permissions.includes(permission),
  );
  if (missing.length > 0) {
    throw createAuthError(403, "Nemáte oprávnenie na tento report.");
  }

  // Druhá línia obrany — potvrdenie cez server RPC pre obe oprávnenia.
  for (const permission of EVENTS_OVERVIEW_PERMISSIONS) {
    const allowed = await hasPermissionServer(ctx.userId, permission);
    if (!allowed) {
      throw createAuthError(403, "Nemáte oprávnenie na tento report.");
    }
  }
}

/** Z ISO dátumu/času (`YYYY-MM-DD...`) izoluje dátumovú časť (`YYYY-MM-DD`). */
function datePart(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Vráti jednotný prehľad udalostí (tréningy + súťaže) so súhrnom.
 * Prázdny výsledok sa spracuje korektne (súhrn samé nuly, prázdne pole).
 *
 * @throws AuthError 401/403 pri chýbajúcej autorizácii, 500 pri chybe čítania.
 */
export async function getEventsOverview(): Promise<EventsOverviewReport> {
  await authorizeEventsOverview();

  const supabase = await createClient();

  // Štyri NE-finančné dotazy (RLS: trainings/attendance = training.view,
  // competitions/teams = competition.view). Bez príslušného oprávnenia
  // RLS vráti prázdne pole — fail-closed, žiadny únik.
  const [trainingsRes, competitionsRes, attendanceRes, teamsRes] =
    await Promise.all([
      supabase
        .from("trainings")
        .select("id, title, start_time, location, status")
        .order("start_time", { ascending: true }),
      supabase
        .from("competitions")
        .select("id, title, date, location, status")
        .order("date", { ascending: true }),
      supabase.from("training_attendance").select("training_id"),
      supabase.from("competition_teams").select("competition_id"),
    ]);

  if (trainingsRes.error) {
    console.error("[getEventsOverview] trainings error:", trainingsRes.error);
    throw createAuthError(500, "Chyba pri načítavaní tréningov.");
  }
  if (competitionsRes.error) {
    console.error("[getEventsOverview] competitions error:", competitionsRes.error);
    throw createAuthError(500, "Chyba pri načítavaní súťaží.");
  }
  if (attendanceRes.error) {
    console.error("[getEventsOverview] attendance error:", attendanceRes.error);
    throw createAuthError(500, "Chyba pri načítavaní dochádzky.");
  }
  if (teamsRes.error) {
    console.error("[getEventsOverview] teams error:", teamsRes.error);
    throw createAuthError(500, "Chyba pri načítavaní družstiev.");
  }


  // Počty účastníkov — spočítané na strane klienta (žiadna neistá agregácia).
  const attendanceByTraining = new Map<string, number>();
  for (const row of (attendanceRes.data ?? []) as { training_id: string }[]) {
    attendanceByTraining.set(
      row.training_id,
      (attendanceByTraining.get(row.training_id) ?? 0) + 1,
    );
  }

  const teamsByCompetition = new Map<string, number>();
  for (const row of (teamsRes.data ?? []) as { competition_id: string }[]) {
    teamsByCompetition.set(
      row.competition_id,
      (teamsByCompetition.get(row.competition_id) ?? 0) + 1,
    );
  }

  const trainingRows = (trainingsRes.data ?? []) as {
    id: string;
    title: string;
    start_time: string;
    location: string | null;
    status: string;
  }[];

  const competitionRows = (competitionsRes.data ?? []) as {
    id: string;
    title: string;
    date: string;
    location: string | null;
    status: string;
  }[];

  const events: EventItem[] = [
    ...trainingRows.map(
      (row): EventItem => ({
        id: row.id,
        type: "TRAINING",
        title: row.title,
        date: datePart(row.start_time),
        location: row.location,
        status: row.status,
        participants: attendanceByTraining.get(row.id) ?? 0,
      }),
    ),
    ...competitionRows.map(
      (row): EventItem => ({
        id: row.id,
        type: "COMPETITION",
        title: row.title,
        date: datePart(row.date),
        location: row.location,
        status: row.status,
        participants: teamsByCompetition.get(row.id) ?? 0,
      }),
    ),
  ].sort((a, b) => {
    // Zostupne podľa dátumu (najnovšie hore); pri rovnakom dátume podľa názvu.
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.title.localeCompare(b.title);
  });

  // Súhrn počíta z rovnakých riadkov (žiadne finančné polia).
  const summary = summarizeEvents(
    events.map((e): EventSummaryRow => ({ type: e.type, status: e.status })),
  );

  return { summary, events };
}
