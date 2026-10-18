// Vehicle Equipment Validation – Výzbroj vozidiel
//
// Validuje M:N väzbu vozidlo <-> vybavenie (tabuľka vehicle_equipment).

import { z } from "zod";

export const VehicleEquipmentInput = z.object({
  vehicle_id: z.string().uuid("Neplatné vozidlo"),
  equipment_id: z.string().uuid("Neplatná položka vybavenia"),
  quantity: z.coerce.number().int("Množstvo musí byť celé číslo").min(1, "Množstvo musí byť aspoň 1").default(1),
  placement: z.string().max(200, "Umiestnenie je príliš dlhé").nullable().optional(),
  notes: z.string().max(1000, "Poznámka je príliš dlhá").nullable().optional(),
});

export type VehicleEquipmentInput = z.infer<typeof VehicleEquipmentInput>;

export const VehicleEquipmentUpdate = VehicleEquipmentInput.partial().omit({
  vehicle_id: true,
  equipment_id: true,
});

export type VehicleEquipmentUpdate = z.infer<typeof VehicleEquipmentUpdate>;

export function validateVehicleEquipment(input: unknown) {
  const parsed = VehicleEquipmentInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }
  if (parsed.data.vehicle_id === parsed.data.equipment_id) {
    return {
      ok: false as const,
      errors: { equipment_id: ["Vozidlo nemôže obsahovať samé seba."] },
    };
  }
  return { ok: true as const, data: parsed.data };
}

export function validateVehicleEquipmentUpdate(input: unknown) {
  const parsed = VehicleEquipmentUpdate.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  }
  return { ok: true as const, data: parsed.data };
}
