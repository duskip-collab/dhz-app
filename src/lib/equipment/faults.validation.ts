// Equipment Faults Validation – Poruchy a hlásenia
//
// Validuje evidenciu porúch (tabuľka equipment_faults).

import { z } from "zod";

export const FaultSeverity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const FaultPriority = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const FaultStatus = ["REPORTED", "TRIAGED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export type FaultSeverityValue = (typeof FaultSeverity)[number];
export type FaultPriorityValue = (typeof FaultPriority)[number];
export type FaultStatusValue = (typeof FaultStatus)[number];

export const FaultInput = z.object({
  equipment_id: z.string().uuid("Neplatná položka techniky"),
  title: z.string().min(1, "Názov poruchy je povinný").max(200, "Názov je príliš dlhý"),
  description: z.string().max(2000, "Popis je príliš dlhý").nullable().optional(),
  severity: z.enum(FaultSeverity).default("MEDIUM"),
  priority: z.enum(FaultPriority).default("NORMAL"),
});

export type FaultInput = z.infer<typeof FaultInput>;

export const FaultUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  severity: z.enum(FaultSeverity).optional(),
  priority: z.enum(FaultPriority).optional(),
  status: z.enum(FaultStatus).optional(),
  assigned_to: z.string().uuid("Neplatný riešiteľ").nullable().optional(),
});

export type FaultUpdate = z.infer<typeof FaultUpdate>;

export function validateFault(input: unknown) {
  const parsed = FaultInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }
  return { ok: true as const, data: parsed.data };
}

export function validateFaultUpdate(input: unknown) {
  const parsed = FaultUpdate.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }
  return { ok: true as const, data: parsed.data };
}
