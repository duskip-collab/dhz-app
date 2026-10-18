"use server";

import { revalidatePath } from "next/cache";
import {
  createEquipmentItem,
  updateEquipmentItem,
  assignEquipmentToMember,
  returnEquipmentFromMember,
  addMaintenanceLog,
} from "@/lib/equipment/equipment.service";
import {
  isEquipmentStatus,
  isEquipmentCondition,
  isMaintenanceType,
  type EquipmentStatus,
  type EquipmentCondition,
  type MaintenanceType,
} from "@/lib/equipment/equipment.validation";

export type EquipmentActionState =
  | { ok: true; equipmentId?: string; assignmentId?: string }
  | { ok: false; errors: Record<string, string>; message: string };

function field(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}

function numField(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fail(message: string, errors: Record<string, string> = {}): EquipmentActionState {
  return { ok: false, errors, message };
}

function handleError(e: unknown, fallback: string): EquipmentActionState {
  const status = (e as { statusCode?: number }).statusCode ?? 500;
  if (status === 403) return fail("Nemáte oprávnenie.");
  if (status === 404) return fail("Záznam sa nenašiel.");
  if (status === 409) return fail(e instanceof Error ? e.message : "Konflikt údajov.");
  if (status === 400) return fail(e instanceof Error ? e.message : "Neplatné údaje.");
  return fail(fallback);
}

function detailsFrom(e: unknown): Record<string, string> {
  if (e && typeof e === "object" && "details" in e) {
    return (e as { details?: Record<string, string> }).details ?? {};
  }
  return {};
}

// Načíta voliteľné údaje vozidla z formulára (ak sú prítomné).
function vehicleFrom(formData: FormData): {
  license_plate?: string | null;
  vin?: string | null;
  fuel_type?: string | null;
  mileage_km?: number;
  engine_hours?: number;
  stk_valid_until?: string | null;
  ek_valid_until?: string | null;
} | null {
  if (
    !formData.has("license_plate") &&
    !formData.has("vin") &&
    !formData.has("mileage_km") &&
    !formData.has("stk_valid_until")
  ) {
    return null;
  }
  return {
    license_plate: field(formData, "license_plate"),
    vin: field(formData, "vin"),
    fuel_type: field(formData, "fuel_type"),
    mileage_km: numField(formData, "mileage_km") ?? 0,
    engine_hours: numField(formData, "engine_hours") ?? 0,
    stk_valid_until: field(formData, "stk_valid_until"),
    ek_valid_until: field(formData, "ek_valid_until"),
  };
}

// =============================================================================
// CREATE
// =============================================================================

export async function createEquipmentAction(
  _prev: EquipmentActionState | null,
  formData: FormData
): Promise<EquipmentActionState> {
  const statusRaw = field(formData, "status") ?? "AVAILABLE";
  if (!isEquipmentStatus(statusRaw)) {
    return fail("Neplatný stav.", { status: "Neplatný stav." });
  }
  const conditionRaw = field(formData, "condition") ?? "GOOD";
  if (!isEquipmentCondition(conditionRaw)) {
    return fail("Neplatný stav opotrebovania.", { condition: "Neplatný stav opotrebovania." });
  }

  const input = {
    category_id: field(formData, "category_id") ?? "",
    name: field(formData, "name") ?? "",
    inventory_number: field(formData, "inventory_number"),
    serial_number: field(formData, "serial_number"),
    status: statusRaw as EquipmentStatus,
    condition: conditionRaw as EquipmentCondition,
    location: field(formData, "location"),
    purchase_date: field(formData, "purchase_date"),
    purchase_price: numField(formData, "purchase_price"),
    next_inspection_date: field(formData, "next_inspection_date"),
    notes: field(formData, "notes"),
  };

  try {
    const item = await createEquipmentItem(input, vehicleFrom(formData));
    revalidatePath("/inventory");
    return { ok: true, equipmentId: item.id };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte zvýraznené polia.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri vytváraní položky.");
  }
}

// =============================================================================
// UPDATE
// =============================================================================

export async function updateEquipmentAction(
  equipmentId: string,
  _prev: EquipmentActionState | null,
  formData: FormData
): Promise<EquipmentActionState> {
  const input: Record<string, unknown> = {};
  const categoryId = field(formData, "category_id");
  if (categoryId !== null) input.category_id = categoryId;
  const name = field(formData, "name");
  if (name !== null) input.name = name;
  if (formData.has("inventory_number")) input.inventory_number = field(formData, "inventory_number");
  if (formData.has("serial_number")) input.serial_number = field(formData, "serial_number");
  if (formData.has("location")) input.location = field(formData, "location");
  if (formData.has("purchase_date")) input.purchase_date = field(formData, "purchase_date");
  if (formData.has("purchase_price")) input.purchase_price = numField(formData, "purchase_price");
  if (formData.has("next_inspection_date")) input.next_inspection_date = field(formData, "next_inspection_date");
  if (formData.has("notes")) input.notes = field(formData, "notes");

  const statusRaw = field(formData, "status");
  if (statusRaw !== null) {
    if (!isEquipmentStatus(statusRaw)) return fail("Neplatný stav.", { status: "Neplatný stav." });
    input.status = statusRaw as EquipmentStatus;
  }
  const conditionRaw = field(formData, "condition");
  if (conditionRaw !== null) {
    if (!isEquipmentCondition(conditionRaw)) {
      return fail("Neplatný stav opotrebovania.", { condition: "Neplatný stav opotrebovania." });
    }
    input.condition = conditionRaw as EquipmentCondition;
  }

  try {
    await updateEquipmentItem(equipmentId, input as never, vehicleFrom(formData));
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${equipmentId}`);
    return { ok: true, equipmentId };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte zvýraznené polia.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri ukladaní položky.");
  }
}

// =============================================================================
// ASSIGN
// =============================================================================

export async function assignEquipmentAction(
  _prev: EquipmentActionState | null,
  formData: FormData
): Promise<EquipmentActionState> {
  const equipmentId = field(formData, "equipment_id") ?? "";
  const memberId = field(formData, "member_id") ?? "";
  const conditionRaw = field(formData, "condition_on_assign");

  try {
    const assignment = await assignEquipmentToMember(
      equipmentId,
      memberId,
      conditionRaw ? (conditionRaw as EquipmentCondition) : null,
      field(formData, "notes")
    );
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${equipmentId}`);
    return { ok: true, equipmentId, assignmentId: assignment.id };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte výdaj.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri výdaji položky.");
  }
}

// =============================================================================
// RETURN
// =============================================================================

export async function returnEquipmentAction(
  _prev: EquipmentActionState | null,
  formData: FormData
): Promise<EquipmentActionState> {
  const assignmentId = field(formData, "assignment_id") ?? "";
  const equipmentId = field(formData, "equipment_id");
  const conditionRaw = field(formData, "condition_on_return");

  try {
    await returnEquipmentFromMember(
      assignmentId,
      conditionRaw ? (conditionRaw as EquipmentCondition) : null,
      field(formData, "notes")
    );
    if (equipmentId) revalidatePath(`/inventory/${equipmentId}`);
    revalidatePath("/inventory");
    return { ok: true, equipmentId: equipmentId ?? undefined, assignmentId };
  } catch (e) {
    return handleError(e, "Chyba pri návrate položky.");
  }
}

// =============================================================================
// MAINTENANCE LOG
// =============================================================================

export async function addMaintenanceLogAction(
  _prev: EquipmentActionState | null,
  formData: FormData
): Promise<EquipmentActionState> {
  const equipmentId = field(formData, "equipment_id") ?? "";
  const typeRaw = field(formData, "type") ?? "";
  if (!isMaintenanceType(typeRaw)) {
    return fail("Neplatný typ údržby.", { type: "Neplatný typ údržby." });
  }

  const input = {
    type: typeRaw as MaintenanceType,
    title: field(formData, "title") ?? "",
    description: field(formData, "description"),
    performed_at: field(formData, "performed_at") ?? "",
    next_due_date: field(formData, "next_due_date"),
    cost: numField(formData, "cost") ?? 0,
    performed_by: field(formData, "performed_by"),
    status: (field(formData, "status") ?? "COMPLETED") as "PLANNED" | "COMPLETED",
  };

  try {
    await addMaintenanceLog(equipmentId, input);
    revalidatePath(`/inventory/${equipmentId}`);
    revalidatePath("/inventory");
    return { ok: true, equipmentId };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 400) {
      return fail("Skontrolujte údaje údržby.", detailsFrom(e));
    }
    return handleError(e, "Chyba pri zápise údržby.");
  }
}

