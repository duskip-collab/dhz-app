// Calendar Service – Server Authorization Layer
// K14 – Kalendár udalostí DHZ
//
// Architektúra: getAuthContext -> permission check -> Supabase RLS.
// RLS zostáva druhou bezpečnostnou vrstvou (defense-in-depth).
//
// Schéma: calendar_events tabuľka (existujúca v DB types)

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { auditCalendarEvent } from "@/lib/audit/audit.service";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateCalendarEvent,
  validateCalendarEventUpdate,
  type CalendarEventInput,
  type CalendarEventUpdateInput,
} from "./calendar.validation";

// =============================================================================
// TYPY
// =============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// =============================================================================
// AUTHENTICATION GUARD
// =============================================================================

async function requireAuthenticated(): Promise<AuthContext> {
  try {
    return await getAuthContext();
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

async function assertPermission(ctx: AuthContext, permission: Permission): Promise<void> {
  const ok =
    ctx.permissions.includes(permission) || (await hasPermissionServer(ctx.userId, permission));
  if (!ok) {
    throw createAuthError(403, "Nemáte oprávnenie na túto operáciu.");
  }
}

const EVENT_SELECT = "*";

// =============================================================================
// READ – getCalendarEvents
// Vyžaduje `calendar.view`. Vráti zoznam udalostí voliteľne filtrovaný.
// =============================================================================

export interface ListCalendarEventsFilters {
  start_from?: string;
  end_to?: string;
  event_type?: string;
}

export async function getCalendarEvents(
  filters?: ListCalendarEventsFilters
): Promise<CalendarEvent[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.CALENDAR_VIEW);

  const supabase = await createClient();

  let query = supabase.from("calendar_events").select(EVENT_SELECT).order("start_at", { ascending: true });

  if (filters?.start_from) {
    query = query.gte("start_at", filters.start_from);
  }
  if (filters?.end_to) {
    query = query.lte("end_at", filters.end_to);
  }
  if (filters?.event_type) {
    query = query.eq("event_type", filters.event_type);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getCalendarEvents] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítaní udalostí.");
  }

  return (data ?? []) as CalendarEvent[];
}

// =============================================================================
// READ – getCalendarEventById
// Vyžaduje `calendar.view`. Vráti jednu udalosť podľa ID.
// =============================================================================

export async function getCalendarEventById(eventId: string): Promise<CalendarEvent> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.CALENDAR_VIEW);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .select(EVENT_SELECT)
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    console.error("[getCalendarEventById] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítaní udalosti.");
  }
  if (!data) throw createAuthError(404, "Udalosť sa nenašla.");

  return data as CalendarEvent;
}

// =============================================================================
// WRITE – createCalendarEvent
// Vyžaduje `calendar.manage`. Vytvorí novú kalendárovú udalosť.
// =============================================================================

export async function createCalendarEvent(input: CalendarEventInput): Promise<CalendarEvent> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.CALENDAR_MANAGE);

  const parsed = validateCalendarEvent(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje udalosti.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      ...parsed.data,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[createCalendarEvent] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vytvorení udalosti.");
  }

  const event = data as CalendarEvent;
  await auditCalendarEvent(ctx.userId, "create", event.id, {
    title: event.title,
    event_type: event.event_type,
    start_at: event.start_at,
    end_at: event.end_at,
  });
  return event;
}

// =============================================================================
// WRITE – updateCalendarEvent
// Vyžaduje `calendar.manage`. Aktualizuje existujúcu udalosť.
// =============================================================================

export async function updateCalendarEvent(
  eventId: string,
  input: CalendarEventUpdateInput
): Promise<CalendarEvent> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.CALENDAR_MANAGE);

  const parsed = validateCalendarEventUpdate(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje aktualizácie.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .update({
      ...parsed.data,
      updated_by: ctx.userId,
    } as never)
    .eq("id", eventId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateCalendarEvent] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Udalosť sa nenašla.");
    throw createAuthError(500, "Chyba pri aktualizácii udalosti.");
  }

  const event = data as CalendarEvent;
  await auditCalendarEvent(ctx.userId, "update", event.id, {
    title: event.title,
    changes: parsed.data,
  });
  return event;
}

// =============================================================================
// WRITE – deleteCalendarEvent
// Vyžaduje `calendar.manage`. Odstráni udalosť.
// =============================================================================

export async function deleteCalendarEvent(eventId: string): Promise<{ id: string }> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.CALENDAR_MANAGE);

  const supabase = await createClient();

  const { data: rawData, error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", eventId)
    .select("id, title")
    .single();

  if (error) {
    console.error("[deleteCalendarEvent] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Udalosť sa nenašla.");
    throw createAuthError(500, "Chyba pri odstraňovaní udalosti.");
  }

  const data = rawData as { id: string; title: string };
  await auditCalendarEvent(ctx.userId, "delete", eventId, {
    title: data.title,
  });
  return { id: eventId };
}

// =============================================================================
// UNIFIED CALENDAR – centrálny prehľad udalostí z celého systému
// Vyžaduje `calendar.view`. Jednotlivé tabuľky sú chránené RLS (per-modul).
// =============================================================================

export type CalendarSource =
  | "calendar"
  | "competition"
  | "work_party"
  | "training"
  | "inspection"
  | "fault"
  | "course";

export interface UnifiedCalendarEvent {
  id: string;
  source: CalendarSource;
  /** Typ udalosti pre farebné odlíšenie (COMPETITION, TRAINING, INSPECTION, WORK_PARTY, FAULT, COURSE, ...). */
  type: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  status: string | null;
}

/**
 * getUnifiedCalendarEvents – Z agreguje plánované udalosti z:
 *  - calendar_events (akcie/udalosti)
 *  - competitions   (hasičské súťaže)
 *  - work_parties   (brigády)
 *  - trainings      (kurzy a školenia / tréningy)
 *  - equipment_inspections (STK, EK, revízie, servis)
 *  - equipment_faults      (poruchy a pripomienky na údržbu)
 *  - member_courses        (platnosť kurzov členov v najbližších 90 dňoch)
 */
export async function getUnifiedCalendarEvents(): Promise<UnifiedCalendarEvent[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.CALENDAR_VIEW);

  const supabase = await createClient();

  const [calendarRes, competitionsRes, workPartiesRes, trainingsRes, inspectionsRes, faultsRes, coursesRes] =
    await Promise.all([
      supabase
        .from("calendar_events")
        .select("id, title, description, event_type, start_at, end_at, location")
        .gte("end_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("start_at", { ascending: true }),
      supabase
        .from("competitions")
        .select("id, title, description, location, date, status")
        .order("date", { ascending: true }),
      supabase
        .from("work_parties")
        .select("id, title, description, work_date, duration_hours, location, status")
        .gte("work_date", new Date().toISOString().slice(0, 10))
        .order("work_date", { ascending: true }),
      supabase
        .from("trainings")
        .select("id, title, description, start_time, end_time, location, status")
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true }),
      supabase
        .from("equipment_inspections")
        .select(
          "id, title, description, type, scheduled_date, status, equipment:equipment_items!equipment_inspections_equipment_id_fkey(name)"
        )
        .gte("scheduled_date", new Date().toISOString().slice(0, 10))
        .order("scheduled_date", { ascending: true }),
      supabase
        .from("equipment_faults")
        .select("id, title, description, severity, status, created_at, equipment:equipment_items!equipment_faults_equipment_id_fkey(name)")
        .in("status", ["REPORTED", "TRIAGED", "IN_PROGRESS"])
        .order("created_at", { ascending: true }),
      supabase
        .from("member_courses")
        .select("id, course_name, expiry_date, issuing_authority, member:members!member_courses_member_id_fkey(first_name, last_name)")
        .not("expiry_date", "is", null)
        .gte("expiry_date", new Date().toISOString().slice(0, 10))
        .lte(
          "expiry_date",
          new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        )
        .order("expiry_date", { ascending: true }),
    ]);

  const events: UnifiedCalendarEvent[] = [];

  for (const item of calendarRes.data ?? []) {
    events.push({
      id: `calendar:${item.id}`,
      source: "calendar",
      type: item.event_type ?? "OTHER",
      title: item.title,
      description: item.description,
      start_at: item.start_at,
      end_at: item.end_at,
      location: item.location,
      status: null,
    });
  }

  for (const item of competitionsRes.data ?? []) {
    events.push({
      id: `competition:${item.id}`,
      source: "competition",
      type: "COMPETITION",
      title: item.title,
      description: item.description,
      start_at: item.date,
      end_at: null,
      location: item.location,
      status: item.status,
    });
  }

  for (const item of workPartiesRes.data ?? []) {
    const start = item.work_date;
    const end = item.duration_hours
      ? new Date(new Date(start + "T00:00:00").getTime() + item.duration_hours * 3600 * 1000).toISOString()
      : null;
    events.push({
      id: `work_party:${item.id}`,
      source: "work_party",
      type: "WORK_PARTY",
      title: item.title,
      description: item.description,
      start_at: start,
      end_at: end,
      location: item.location,
      status: item.status,
    });
  }

  for (const item of trainingsRes.data ?? []) {
    events.push({
      id: `training:${item.id}`,
      source: "training",
      type: "TRAINING",
      title: item.title,
      description: item.description,
      start_at: item.start_time,
      end_at: item.end_time,
      location: item.location,
      status: item.status,
    });
  }

  for (const item of inspectionsRes.data ?? []) {
    const equipmentName = (item.equipment as { name?: string } | null)?.name ?? "";
    events.push({
      id: `inspection:${item.id}`,
      source: "inspection",
      type: "INSPECTION",
      title: item.title || `${equipmentName} – ${item.type ?? "revízia"}`.trim(),
      description: item.description,
      start_at: item.scheduled_date,
      end_at: null,
      location: null,
      status: item.status,
    });
  }

  for (const item of faultsRes.data ?? []) {
    const equipmentName = (item.equipment as { name?: string } | null)?.name ?? "";
    events.push({
      id: `fault:${item.id}`,
      source: "fault",
      type: "FAULT",
      title: item.title || `Porucha – ${equipmentName}`,
      description: item.description,
      start_at: item.created_at,
      end_at: null,
      location: equipmentName || null,
      status: item.status,
    });
  }

  for (const item of coursesRes.data ?? []) {
    const memberRaw = (item as { member?: unknown }).member;
    const member = Array.isArray(memberRaw) ? memberRaw[0] : memberRaw;
    const memberName =
      member && typeof member === "object" && "first_name" in member && "last_name" in member
        ? `${(member as { first_name: string }).first_name} ${(member as { last_name: string }).last_name}`
        : "";
    events.push({
      id: `course:${item.id}`,
      source: "course",
      type: "COURSE",
      title: `Kurz: ${item.course_name}${memberName ? ` (${memberName})` : ""}`,
      description: item.issuing_authority ?? null,
      start_at: item.expiry_date,
      end_at: null,
      location: null,
      status: null,
    });
  }

  return events.sort((a, b) => a.start_at.localeCompare(b.start_at));
}