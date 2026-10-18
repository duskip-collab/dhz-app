// Work Parties Module Validation – Brigády DHZ
//
// Validuje vstupné údaje pre tabuľku work_parties.

import { z } from "zod";

export const WorkPartyStatus = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export type WorkPartyStatusValue = (typeof WorkPartyStatus)[number];

export function isWorkPartyStatus(value: string): value is WorkPartyStatusValue {
  return WorkPartyStatus.includes(value as WorkPartyStatusValue);
}

export interface WorkPartyInput {
  title: string;
  description?: string | null;
  work_date: string;
  duration_hours?: number;
  location?: string | null;
  status?: string;
  max_volunteers?: number | null;
  notes?: string | null;
}

export interface WorkPartyUpdateInput {
  title?: string;
  description?: string | null;
  work_date?: string;
  duration_hours?: number;
  location?: string | null;
  status?: string;
  max_volunteers?: number | null;
  notes?: string | null;
}

const baseWorkPartySchema = z.object({
  title: z.string().min(1, "Názov brigády je povinný").max(200, "Názov je príliš dlhý"),
  description: z.string().nullable().optional(),
  work_date: z.string().datetime("Neplatný dátum brigády"),
  duration_hours: z.number().min(0.5, "Dĺžka musí byť aspoň 0,5 hodiny").optional(),
  location: z.string().nullable().optional(),
  status: z.string().optional(),
  max_volunteers: z.number().int().min(1).optional(),
  notes: z.string().nullable().optional(),
});

export function validateWorkParty(input: unknown) {
  const parsed = baseWorkPartySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  return { ok: true, data: parsed.data };
}

export function validateWorkPartyUpdate(input: unknown) {
  const updateSchema = baseWorkPartySchema.partial();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  return { ok: true, data: parsed.data };
}
