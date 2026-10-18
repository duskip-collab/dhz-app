"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createEquipmentItem,
  updateEquipmentItem,
  deleteEquipmentItem,
  assignEquipmentToMember,
  returnEquipmentFromMember,
  addMaintenanceLog,
  createEquipmentCategory,
  updateEquipmentCategory,
  deleteEquipmentCategory,
} from "@/lib/equipment/equipment.service";
import {
  isEquipmentStatus,
  isEquipmentCondition,
  isMaintenanceType,
  type EquipmentStatus,
  type EquipmentCondition,
  type MaintenanceType,
} from "@/lib/equipment/equipment.validation";

// =============================================================================
// Pomocna© funkcie
// =============================================================================

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

function boolField(formData: FormData, name: string): boolean {
  const raw = formData.get(name);
  return raw === "on" || raw === "true" || raw === "1";
}

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

function redirectWithSuccess(path: string, message: string): never {
  const params = new URLSearchParams({ success: message });
  redirect(`${path}?${params.toString()}`);
}

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
// POLOĹ˝KY â€“ CREATE / UPDATE / DELETE
// =============================================================================

export async function createGearItemAction(formData: FormData): Promise<void> {
  const statusRaw = field(formData, "status") ?? "AVAILABLE";
  if (!isEquipmentStatus(statusRaw)) redirectWithError("/gear/new", "Neplatna˝ stav.");
  const conditionRaw = field(formData, "condition") ?? "GOOD";
  if (!isEquipmentCondition(conditionRaw)) {
    redirectWithError("/gear/new", "Neplatna˝ stav opotrebovania.");
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

  if (!input.category_id || !input.name) {
    redirectWithError("/gear/new", "Kategałria a naˇzov saş povinna©.");
  }

  try {
    const item = await createEquipmentItem(input, vehicleFrom(formData));
    revalidatePath("/gear");
    redirect(`/gear/${item.id}`);
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri vytvaˇrana­ poloĹľky.";
    redirectWithError("/gear/new", message);
  }
}

export async function updateGearItemAction(
  equipmentId: string,
  formData: FormData
): Promise<void> {
  const backPath = `/gear/${equipmentId}/edit`;
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
  if (formData.has("next_inspection_date")) {
    input.next_inspection_date = field(formData, "next_inspection_date");
  }
  if (formData.has("notes")) input.notes = field(formData, "notes");

  const statusRaw = field(formData, "status");
  if (statusRaw !== null) {
    if (!isEquipmentStatus(statusRaw)) redirectWithError(backPath, "Neplatna˝ stav.");
    input.status = statusRaw as EquipmentStatus;
  }
  const conditionRaw = field(formData, "condition");
  if (conditionRaw !== null) {
    if (!isEquipmentCondition(conditionRaw)) {
      redirectWithError(backPath, "Neplatna˝ stav opotrebovania.");
    }
    input.condition = conditionRaw as EquipmentCondition;
  }

  try {
    await updateEquipmentItem(equipmentId, input as never, vehicleFrom(formData));
    revalidatePath("/gear");
    revalidatePath(`/gear/${equipmentId}`);
    redirect(`/gear/${equipmentId}`);
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri ukladana­ poloĹľky.";
    redirectWithError(backPath, message);
  }
}

export async function deleteGearItemAction(formData: FormData): Promise<void> {
  const equipmentId = field(formData, "equipment_id");
  if (!equipmentId) redirectWithError("/gear", "Cha˝ba identifikaˇtor poloĹľky.");

  try {
    await deleteEquipmentItem(equipmentId);
    revalidatePath("/gear");
    redirectWithSuccess("/gear", "PoloĹľka bola vymazanaˇ.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri mazana­ poloĹľky.";
    redirectWithError(`/gear/${equipmentId}`, message);
  }
}

// =============================================================================
// PRIRADENIA â€“ ASSIGN / RETURN
// =============================================================================

export async function assignGearAction(formData: FormData): Promise<void> {
  const equipmentId = field(formData, "equipment_id") ?? "";
  const memberId = field(formData, "member_id") ?? "";
  const conditionRaw = field(formData, "condition_on_assign");

  if (!equipmentId || !memberId) {
    redirectWithError("/gear/assign", "PoloĹľka aj ÄŤlen saş povinna©.");
  }

  try {
    await assignEquipmentToMember(
      equipmentId,
      memberId,
      conditionRaw ? (conditionRaw as EquipmentCondition) : null,
      field(formData, "notes")
    );
    revalidatePath("/gear");
    revalidatePath(`/gear/${equipmentId}`);
    redirectWithSuccess("/gear/assignments", "Technika bola priradenaˇ.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri priradena­ techniky.";
    redirectWithError("/gear/assign", message);
  }
}

export async function returnGearAction(formData: FormData): Promise<void> {
  const assignmentId = field(formData, "assignment_id") ?? "";
  const equipmentId = field(formData, "equipment_id");
  const conditionRaw = field(formData, "condition_on_return");

  if (!assignmentId) redirectWithError("/gear/assignments", "Cha˝ba identifikaˇtor va˝daja.");

  try {
    await returnEquipmentFromMember(
      assignmentId,
      conditionRaw ? (conditionRaw as EquipmentCondition) : null,
      field(formData, "notes")
    );
    revalidatePath("/gear");
    if (equipmentId) revalidatePath(`/gear/${equipmentId}`);
    redirectWithSuccess("/gear/assignments", "Technika bola vraˇtenaˇ.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri naˇvrate techniky.";
    redirectWithError("/gear/assignments", message);
  }
}

// =============================================================================
// ašDRĹ˝BA â€“ ADD LOG
// =============================================================================

export async function addMaintenanceLogAction(formData: FormData): Promise<void> {
  const equipmentId = field(formData, "equipment_id") ?? "";
  const backPath = equipmentId ? `/gear/${equipmentId}/maintenance` : "/gear";

  const typeRaw = field(formData, "type") ?? "";
  if (!isMaintenanceType(typeRaw)) redirectWithError(backPath, "Neplatna˝ typ aşdrĹľby.");

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

  if (!equipmentId) redirectWithError(backPath, "Cha˝ba identifikaˇtor poloĹľky.");
  if (!input.title || !input.performed_at) {
    redirectWithError(backPath, "Naˇzov a daˇtum vykonania saş povinna©.");
  }


  try {
    await addMaintenanceLog(equipmentId, input);
    revalidatePath(`/gear/${equipmentId}`);
    revalidatePath(backPath);
    redirectWithSuccess(backPath, "Záznam údrzby bol pridaný.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri zápise údrzby.";
    redirectWithError(backPath, message);
  }
}
// =============================================================================
// KATEGa“RIE â€“ CREATE / UPDATE / DELETE
// =============================================================================

export async function createCategoryAction(formData: FormData): Promise<void> {
  const name = field(formData, "name") ?? "";
  const code = field(formData, "code") ?? "";
  if (!name || !code) redirectWithError("/gear/categories", "Naˇzov a kałd saş povinna©.");

  try {
    await createEquipmentCategory({
      name,
      code,
      description: field(formData, "description"),
      requires_inspection: boolField(formData, "requires_inspection"),
    });
    revalidatePath("/gear");
    revalidatePath("/gear/categories");
    redirectWithSuccess("/gear/categories", "Kategałria bola vytvorenaˇ.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri vytvaˇrana­ kategałrie.";
    redirectWithError("/gear/categories", message);
  }
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  const categoryId = field(formData, "category_id") ?? "";
  if (!categoryId) redirectWithError("/gear/categories", "Cha˝ba identifikaˇtor kategałrie.");

  const name = field(formData, "name");
  const code = field(formData, "code");
  if (!name || !code) redirectWithError("/gear/categories", "Naˇzov a kałd saş povinna©.");

  try {
    await updateEquipmentCategory(categoryId, {
      name,
      code,
      description: field(formData, "description"),
      requires_inspection: boolField(formData, "requires_inspection"),
    });
    revalidatePath("/gear");
    revalidatePath("/gear/categories");
    redirectWithSuccess("/gear/categories", "Kategałria bola uloĹľenaˇ.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri ukladana­ kategałrie.";
    redirectWithError("/gear/categories", message);
  }
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const categoryId = field(formData, "category_id") ?? "";
  if (!categoryId) redirectWithError("/gear/categories", "Cha˝ba identifikaˇtor kategałrie.");

  try {
    await deleteEquipmentCategory(categoryId);
    revalidatePath("/gear");
    revalidatePath("/gear/categories");
    redirectWithSuccess("/gear/categories", "Kategałria bola vymazanaˇ.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    const message =
      error instanceof Error && error.message ? error.message : "Chyba pri mazana­ kategałrie.";
    redirectWithError("/gear/categories", message);
  }
}
