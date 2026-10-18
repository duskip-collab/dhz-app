// Calendar Module Validation – K14 Kalendár
//
// Validuje vstupné údaje pre tabuľku calendar_events.

import { z } from "zod";

export const CalendarEventType = [
  "MEETING",
  "TRAINING",
  "INCIDENT",
  "WORK_PARTY",
  "OTHER",
] as const;

export type CalendarEventTypeValue = (typeof CalendarEventType)[number];

export function isCalendarEventType(value: string): value is CalendarEventTypeValue {
  return CalendarEventType.includes(value as CalendarEventTypeValue);
}

export interface CalendarEventInput {
  title: string;
  description?: string | null;
  event_type?: string;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  location?: string | null;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
}

export interface CalendarEventUpdateInput {
  title?: string;
  description?: string | null;
  event_type?: string;
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  location?: string | null;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
}

const baseEventSchema = z.object({
  title: z.string().min(1, "Názov je povinný").max(200, "Názov je príliš dlhý"),
  description: z.string().nullable().optional(),
  event_type: z.string().optional(),
  start_at: z.string().datetime("Neplatný začiatok"),
  end_at: z.string().datetime("Neplatný koniec"),
  all_day: z.boolean().optional(),
  location: z.string().nullable().optional(),
  is_recurring: z.boolean().optional(),
  recurrence_rule: z.string().nullable().optional(),
});

export function validateCalendarEvent(input: unknown) {
  const parsed = baseEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data as CalendarEventInput;
  if (new Date(data.end_at) <= new Date(data.start_at)) {
    return {
      ok: false,
      errors: { end_at: ["Koniec musí byť po začiatku"] },
    };
  }
  return { ok: true, data };
}

export function validateCalendarEventUpdate(input: unknown) {
  const updateSchema = baseEventSchema.partial();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data as CalendarEventUpdateInput;
  if (data.start_at && data.end_at && new Date(data.end_at) <= new Date(data.start_at)) {
    return {
      ok: false,
      errors: { end_at: ["Koniec musí byť po začiatku"] },
    };
  }
  return { ok: true, data };
}
