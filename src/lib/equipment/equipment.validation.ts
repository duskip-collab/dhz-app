// Equipment validation – ručná validácia bez externých závislostí (bez Zod)
// K11.2 – Equipment Server Access Layer & Actions
//
// Zodnáša sa po schéme K11.1 (20261012_equipment_module.sql):
//   equipment_categories, equipment_items, vehicle_details,
//   equipment_assignments, equipment_maintenance_logs

export type EquipmentStatus =
  | "AVAILABLE"
  | "IN_SERVICE"
  | "RESERVED"
  | "DAMAGED"
  | "DISPOSED";

export type EquipmentCondition =
  | "NEW"
  | "GOOD"
  | "FAIR"
  | "POOR"
  | "UNSERVICEABLE";

export type MaintenanceType =
  | "STK_EK"
  | "REVISION"
  | "SERVICE_CHECK"
  | "REPAIR"
  | "INSPECTION";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

export interface EquipmentItemInput {
  category_id: string;
  name: string;
  inventory_number?: string | null;
  serial_number?: string | null;
  status?: EquipmentStatus;
  condition?: EquipmentCondition;
  location?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  next_inspection_date?: string | null;
  notes?: string | null;
}

export interface VehicleDetailsInput {
  license_plate?: string | null;
  vin?: string | null;
  fuel_type?: string | null;
  mileage_km?: number;
  engine_hours?: number;
  stk_valid_until?: string | null;
  ek_valid_until?: string | null;
}

export interface EquipmentAssignmentInput {
  equipment_id: string;
  member_id: string;
  condition_on_assign?: EquipmentCondition | null;
  notes?: string | null;
}

export interface MaintenanceLogInput {
  type: MaintenanceType;
  title: string;
  description?: string | null;
  performed_at: string;
  next_due_date?: string | null;
  cost?: number;
  performed_by?: string | null;
  status?: "PLANNED" | "COMPLETED";
}

const EQUIPMENT_STATUSES: readonly EquipmentStatus[] = [
  "AVAILABLE",
  "IN_SERVICE",
  "RESERVED",
  "DAMAGED",
  "DISPOSED",
];
const EQUIPMENT_CONDITIONS: readonly EquipmentCondition[] = [
  "NEW",
  "GOOD",
  "FAIR",
  "POOR",
  "UNSERVICEABLE",
];
const MAINTENANCE_TYPES: readonly MaintenanceType[] = [
  "STK_EK",
  "REVISION",
  "SERVICE_CHECK",
  "REPAIR",
  "INSPECTION",
];
const FUEL_TYPES = ["DIESEL", "PETROL", "ELECTRIC"];

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

function parseDate(value: string | null | undefined): Date | null {
  if (isBlank(value)) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isEquipmentStatus(value: string): value is EquipmentStatus {
  return (EQUIPMENT_STATUSES as readonly string[]).includes(value);
}

export function isEquipmentCondition(value: string): value is EquipmentCondition {
  return (EQUIPMENT_CONDITIONS as readonly string[]).includes(value);
}

export function isMaintenanceType(value: string): value is MaintenanceType {
  return (MAINTENANCE_TYPES as readonly string[]).includes(value);
}

// numberOrNull – normalizuje vstup (string z formulára alebo číslo) na finite číslo.
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

// -----------------------------------------------------------------------------
// EQUIPMENT ITEM
// -----------------------------------------------------------------------------

export function validateEquipmentItem(input: EquipmentItemInput): ValidationResult<{
  category_id: string;
  name: string;
  inventory_number: string | null;
  serial_number: string | null;
  status: EquipmentStatus;
  condition: EquipmentCondition;
  location: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  next_inspection_date: string | null;
  notes: string | null;
}> {
  const errors: Record<string, string> = {};

  if (isBlank(input.category_id)) errors.category_id = "Kategória je povinná.";

  const name = (input.name ?? "").trim();
  if (isBlank(name)) errors.name = "Názov položky je povinný.";
  else if (name.length > 200) errors.name = "Názov je príliš dlhý (max 200 znakov).";

  const status = (input.status ?? "AVAILABLE") as EquipmentStatus;
  if (!isEquipmentStatus(status)) errors.status = "Neplatný stav.";

  const condition = (input.condition ?? "GOOD") as EquipmentCondition;
  if (!isEquipmentCondition(condition)) errors.condition = "Neplatný stav opotrebovania.";

  const purchasePrice = numberOrNull(input.purchase_price);
  if (purchasePrice !== null && purchasePrice < 0) {
    errors.purchase_price = "Kúpna cena nemôže byť záporná.";
  }

  const purchaseDate = parseDate(input.purchase_date);
  if (!isBlank(input.purchase_date) && !purchaseDate) {
    errors.purchase_date = "Neplatný dátum nákupu.";
  }

  const nextInspection = parseDate(input.next_inspection_date);
  if (!isBlank(input.next_inspection_date) && !nextInspection) {
    errors.next_inspection_date = "Neplatný dátum kontroly.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      category_id: input.category_id.trim(),
      name,
      inventory_number: trimOrNull(input.inventory_number ?? null),
      serial_number: trimOrNull(input.serial_number ?? null),
      status,
      condition,
      location: trimOrNull(input.location ?? null),
      purchase_date: purchaseDate ? purchaseDate.toISOString().slice(0, 10) : null,
      purchase_price: purchasePrice,
      next_inspection_date: nextInspection ? nextInspection.toISOString().slice(0, 10) : null,
      notes: trimOrNull(input.notes ?? null),
    },
  };
}

// -----------------------------------------------------------------------------
// VEHICLE DETAILS
// -----------------------------------------------------------------------------

export function validateVehicleDetails(input: VehicleDetailsInput): ValidationResult<{
  license_plate: string | null;
  vin: string | null;
  fuel_type: string | null;
  mileage_km: number;
  engine_hours: number;
  stk_valid_until: string | null;
  ek_valid_until: string | null;
}> {
  const errors: Record<string, string> = {};

  const fuelType = trimOrNull(input.fuel_type ?? null);
  if (fuelType !== null && !FUEL_TYPES.includes(fuelType.toUpperCase())) {
    errors.fuel_type = "Neplatný typ paliva.";
  }

  const mileage = numberOrNull(input.mileage_km) ?? 0;
  if (mileage < 0) errors.mileage_km = "Stav tachometra nemôže byť záporný.";

  const engineHours = numberOrNull(input.engine_hours) ?? 0;
  if (engineHours < 0) errors.engine_hours = "Motohodiny nemôžu byť záporné.";

  const stk = parseDate(input.stk_valid_until);
  if (!isBlank(input.stk_valid_until) && !stk) errors.stk_valid_until = "Neplatný dátum STK.";

  const ek = parseDate(input.ek_valid_until);
  if (!isBlank(input.ek_valid_until) && !ek) errors.ek_valid_until = "Neplatný dátum EK.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      license_plate: trimOrNull(input.license_plate ?? null),
      vin: trimOrNull(input.vin ?? null),
      fuel_type: fuelType ? fuelType.toUpperCase() : null,
      mileage_km: mileage,
      engine_hours: engineHours,
      stk_valid_until: stk ? stk.toISOString().slice(0, 10) : null,
      ek_valid_until: ek ? ek.toISOString().slice(0, 10) : null,
    },
  };
}


// -----------------------------------------------------------------------------
// EQUIPMENT ASSIGNMENT
// -----------------------------------------------------------------------------

export function validateEquipmentAssignment(
  input: EquipmentAssignmentInput
): ValidationResult<{
  equipment_id: string;
  member_id: string;
  condition_on_assign: EquipmentCondition | null;
  notes: string | null;
}> {
  const errors: Record<string, string> = {};

  if (isBlank(input.equipment_id)) errors.equipment_id = "Chýba položka inventára.";
  if (isBlank(input.member_id)) errors.member_id = "Chýba člen.";

  let conditionOnAssign: EquipmentCondition | null = null;
  if (input.condition_on_assign !== undefined && input.condition_on_assign !== null) {
    if (!isEquipmentCondition(input.condition_on_assign)) {
      errors.condition_on_assign = "Neplatný stav opotrebovania.";
    } else {
      conditionOnAssign = input.condition_on_assign;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      equipment_id: input.equipment_id.trim(),
      member_id: input.member_id.trim(),
      condition_on_assign: conditionOnAssign,
      notes: trimOrNull(input.notes ?? null),
    },
  };
}

// -----------------------------------------------------------------------------
// MAINTENANCE LOG
// -----------------------------------------------------------------------------

export function validateMaintenanceLog(input: MaintenanceLogInput): ValidationResult<{
  type: MaintenanceType;
  title: string;
  description: string | null;
  performed_at: string;
  next_due_date: string | null;
  cost: number;
  performed_by: string | null;
  status: "PLANNED" | "COMPLETED";
}> {
  const errors: Record<string, string> = {};

  if (!isMaintenanceType(input.type)) errors.type = "Neplatný typ údržby.";

  const title = (input.title ?? "").trim();
  if (isBlank(title)) errors.title = "Názov údržby je povinný.";
  else if (title.length > 200) errors.title = "Názov je príliš dlhý (max 200 znakov).";

  const performedAt = parseDate(input.performed_at);
  if (!performedAt) errors.performed_at = "Dátum vykonania je povinný a musí byť platný.";

  const nextDue = parseDate(input.next_due_date);
  if (!isBlank(input.next_due_date) && !nextDue) {
    errors.next_due_date = "Neplatný dátum nasledujúcej kontroly.";
  }

  const cost = numberOrNull(input.cost) ?? 0;
  if (cost < 0) errors.cost = "Náklady nemôžu byť záporné.";

  const status = (input.status ?? "COMPLETED") as "PLANNED" | "COMPLETED";
  if (status !== "PLANNED" && status !== "COMPLETED") {
    errors.status = "Neplatný stav údržby.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      type: input.type,
      title,
      description: trimOrNull(input.description ?? null),
      performed_at: (performedAt as Date).toISOString().slice(0, 10),
      next_due_date: nextDue ? nextDue.toISOString().slice(0, 10) : null,
      cost,
      performed_by: trimOrNull(input.performed_by ?? null),
      status,
    },
  };
}

