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