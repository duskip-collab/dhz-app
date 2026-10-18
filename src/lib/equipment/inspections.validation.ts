// Equipment Inspections Validation – Revízie, STK/EK, kontroly, servisy
//
// Validuje plán a evidenciu revízií (tabuľka equipment_inspections).

import { z } from "zod";

export const InspectionType = ["STK", "EK", "REVISION", "PERIODIC_CHECK", "SERVICE"] as const;
export const InspectionStatus = [
  "PLANNED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "OVERDUE",
  "CANCELLED",
] as const;

export type InspectionTypeValue = (typeof InspectionType)[number];
export type InspectionStatusValue = (typeof InspectionStatus)[number];

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť vo formáte RRRR-MM-DD")
  .nullable()
  .optional();

export const InspectionInput = z.object({
  equipment_id: z.string().uuid("Neplatná položka techniky"),
  type: z.enum(InspectionType, { message: "Neplatný typ revízie" }),
  title: z.string().min(1, "Názov je povinný").max(200, "Názov je príliš dlhý"),
  description: z.string().max(2000, "Popis je príliš dlhý").nullable().optional(),
  scheduled_date: dateString,
  performed_at: dateString,
  valid_until: dateString,
  performed_by: z.string().max(200, "Vykonávateľ je príliš dlhý").nullable().optional(),
  cost: z.coerce.number().min(0, "Náklady nemôžu byť záporné").nullable().optional(),
  protocol_number: z.string().max(100, "Číslo protokolu je príliš dlhé").nullable().optional(),
});

export type InspectionInput = z.infer<typeof InspectionInput>;

export const InspectionUpdate = InspectionInput.partial()
  .omit({ equipment_id: true })
  .extend({ status: z.enum(InspectionStatus).optional() });

export type InspectionUpdate = z.infer<typeof InspectionUpdate>;

export function validateInspection(input: unknown) {
  const parsed = InspectionInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }
  return { ok: true as const, data: parsed.data };
}

export function validateInspectionUpdate(input: unknown) {
  const parsed = InspectionUpdate.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }
  return { ok: true as const, data: parsed.data };
}
