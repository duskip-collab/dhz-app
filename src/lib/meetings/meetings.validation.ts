// Meetings Module Validation – Porady DHZ
//
// Validuje vstupné údaje pre tabuľku meetings.

import { z } from "zod";

export const MeetingType = ["SCHEDULED", "EXTRAORDINARY", "TRAINING", "OTHER"] as const;

export type MeetingTypeValue = (typeof MeetingType)[number];

export function isMeetingType(value: string): value is MeetingTypeValue {
  return MeetingType.includes(value as MeetingTypeValue);
}

export interface MeetingInput {
  title: string;
  description?: string | null;
  meeting_type?: string;
  scheduled_at: string;
  duration_minutes?: number;
  location?: string | null;
  agenda?: string | null;
  minutes?: string | null;
  is_remote?: boolean;
  remote_link?: string | null;
}

export interface MeetingUpdateInput {
  title?: string;
  description?: string | null;
  meeting_type?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  location?: string | null;
  agenda?: string | null;
  minutes?: string | null;
  is_remote?: boolean;
  remote_link?: string | null;
}

const baseMeetingSchema = z.object({
  title: z.string().min(1, "Názov schôze je povinný").max(200, "Názov je príliš dlhý"),
  description: z.string().nullable().optional(),
  meeting_type: z.string().optional(),
  // Opravené: chybová hláška je vložená priamo do objektu konfigurácie pre datetime
  scheduled_at: z.string().datetime({ offset: true, message: "Neplatný termín schôze" }),
  duration_minutes: z.number().min(1, "Dĺžka musí byť aspoň 1 minúta").optional(),
  location: z.string().nullable().optional(),
  agenda: z.string().nullable().optional(),
  minutes: z.string().nullable().optional(),
  is_remote: z.boolean().optional(),
  remote_link: z.string().nullable().optional(),
});

export function validateMeeting(input: unknown) {
  const parsed = baseMeetingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  return { ok: true, data: parsed.data };
}

export function validateMeetingUpdate(input: unknown) {
  const updateSchema = baseMeetingSchema.partial();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  return { ok: true, data: parsed.data };
}