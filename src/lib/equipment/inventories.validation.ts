// Inventory Checks Validation – Inventarizácia
//
// Validuje inventarizačné kontroly a ich položky
// (tabuľky inventory_checks, inventory_check_items).

import { z } from "zod";

export const InventoryCheckStatus = ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export type InventoryCheckStatusValue = (typeof InventoryCheckStatus)[number];

export const InventoryCheckInput = z.object({
  title: z.string().min(1, "Názov kontroly je povinný").max(200, "Názov je príliš dlhý"),
  description: z.string().max(2000, "Popis je príliš dlhý").nullable().optional(),
});

export type InventoryCheckInput = z.infer<typeof InventoryCheckInput>;

export const InventoryCheckUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(InventoryCheckStatus).optional(),
});

export type InventoryCheckUpdate = z.infer<typeof InventoryCheckUpdate>;

export const InventoryCheckItemVerify = z.object({
  check_id: z.string().uuid("Neplatná kontrola"),
  equipment_id: z.string().uuid("Neplatná položka"),
  found: z.boolean({ message: "Výsledok overenia je povinný" }),
  condition_found: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000, "Poznámka je príliš dlhá").nullable().optional(),
});

export type InventoryCheckItemVerify = z.infer<typeof InventoryCheckItemVerify>;

export function validateInventoryCheck(input: unknown) {
  const parsed = InventoryCheckInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }
  return { ok: true as const, data: parsed.data };
}

export function validateInventoryCheckUpdate(input: unknown) {
  const parsed = InventoryCheckUpdate.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }
  return { ok: true as const, data: parsed.data };
}

export function validateInventoryCheckItem(input: unknown) {
  const parsed = InventoryCheckItemVerify.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }
  return { ok: true as const, data: parsed.data };
}
