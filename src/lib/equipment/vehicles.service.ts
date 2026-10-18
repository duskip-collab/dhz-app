// Vehicles & Vehicle Equipment Service - Server Authorization Layer
//
// Bezpečné server-side operácie pre Vozidlá a Výzbroj vozidiel.
// Architektúra: getAuthContext -> permission check -> Supabase RLS.
// Schéma: 20261010_equipment_module.sql + 20261030_equipment_submodules.sql

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateVehicleEquipment,
  validateVehicleEquipmentUpdate,
  type VehicleEquipmentInput,
  type VehicleEquipmentUpdate,
} from "./vehicle-equipment.validation";

// =============================================================================
// TYPY
// =============================================================================

export interface Vehicle {
  id: string;
  category_id: string;
  name: string;
  inventory_number: string | null;
  serial_number: string | null;
  status: string;
  condition: string;
  location: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  next_inspection_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicle_details: {
    id: string;
    license_plate: string | null;
    vin: string | null;
    fuel_type: string | null;
    mileage_km: number;
    engine_hours: number;
    stk_valid_until: string | null;
    ek_valid_until: string | null;
  } | null;
}

export interface VehicleEquipmentRow {
  id: string;
  vehicle_id: string;
  equipment_id: string;
  quantity: number;
  placement: string | null;
  notes: string | null;
  created_at: string;
  equipment?: {
    id: string;
    name: string;
    inventory_number: string | null;
    status: string;
    condition: string;
  } | null;
}

// =============================================================================
// AUTH GUARD (vzor equipment.service.ts)
// =============================================================================

async function requireAuthenticated(): Promise<AuthContext> {
  try {
    return await getAuthContext();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Unable to load authenticated user") ||
      message.includes("Session expired")
    ) {
      throw createAuthError(401, "Prihlásenie vypršalo alebo neplatí.");
    }
    throw error;
  }
}


// =============================================================================
// READ – getVehicles (polozky s vehicle_details)
// Vyzaduje `vehicle.view`.
// =============================================================================

export async function getVehicles(): Promise<Vehicle[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.VEHICLE_VIEW);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_items")
    .select("*, vehicle_details!inner(*)")
    .order("name", { ascending: true });

  if (error) {
    console.error("[getVehicles] Supabase error:", error);
    throw createAuthError(500, "Chyba pri nacitavani vozidiel.");
  }

  return (data || []) as Vehicle[];
}

// =============================================================================
// READ – getVehicleById (vozidlo + vyzbroj)
// Vyzaduje `vehicle.view`.
// =============================================================================

export interface VehicleDetail extends Vehicle {
  vehicle_equipment: VehicleEquipmentRow[];
}

export async function getVehicleById(vehicleId: string): Promise<VehicleDetail> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.VEHICLE_VIEW);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_items")
    .select("*, vehicle_details(*)")
    .eq("id", vehicleId)
    .single();

  if (error) {
    console.error("[getVehicleById] Supabase error:", error);
    throw createAuthError(404, "Vozidlo sa nenaslo.");
  }

  const vehicle = data as Vehicle;
  if (!vehicle.vehicle_details) {
    throw createAuthError(404, "Polozka nie je vozidlo.");
  }

  const equipment = await getVehicleEquipment(vehicleId);
  return { ...vehicle, vehicle_equipment: equipment };
}

// =============================================================================
// READ – getVehicleEquipment (vyzbroj vozidla)
// Vyzaduje `vehicle.view`.
// =============================================================================

export async function getVehicleEquipment(vehicleId: string): Promise<VehicleEquipmentRow[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.VEHICLE_VIEW);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_equipment")
    .select(
      "*, equipment:equipment_items!vehicle_equipment_equipment_id_fkey(id, name, inventory_number, status, condition)"
    )
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getVehicleEquipment] Supabase error:", error);
    throw createAuthError(500, "Chyba pri nacitavani vyzbroje vozidla.");
  }

  return (data || []) as VehicleEquipmentRow[];
}

// =============================================================================
// WRITE – addVehicleEquipment (priradenie vybavenia k vozidlu)
// Vyzaduje `vehicle.manage`.
// =============================================================================

export async function addVehicleEquipment(input: VehicleEquipmentInput): Promise<VehicleEquipmentRow> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.VEHICLE_MANAGE);

  const parsed = validateVehicleEquipment(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatne udaje vyzbroje.", parsed.errors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_equipment")
    .insert({ ...parsed.data, created_by: ctx.userId } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[addVehicleEquipment] Supabase error:", error);
    if (error.code === "23505") {
      throw createAuthError(409, "Toto vybavenie je uz k vozidlu priradene.");
    }
    throw createAuthError(500, "Chyba pri priradovani vybavenia.");
  }

  return data as VehicleEquipmentRow;
}

// =============================================================================
// WRITE – updateVehicleEquipment
// Vyzaduje `vehicle.manage`.
// =============================================================================

export async function updateVehicleEquipment(
  rowId: string,
  input: VehicleEquipmentUpdate
): Promise<VehicleEquipmentRow> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.VEHICLE_MANAGE);

  const parsed = validateVehicleEquipmentUpdate(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatne udaje vyzbroje.", parsed.errors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_equipment")
    .update(parsed.data as never)
    .eq("id", rowId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateVehicleEquipment] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladani vyzbroje.");
  }
  return data as VehicleEquipmentRow;
}

// =============================================================================
// WRITE – removeVehicleEquipment
// Vyžaduje `vehicle.manage`.
// =============================================================================

export async function removeVehicleEquipment(rowId: string): Promise<void> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.VEHICLE_MANAGE);

  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_equipment").delete().eq("id", rowId);

  if (error) {
    console.error("[removeVehicleEquipment] Supabase error:", error);
    throw createAuthError(500, "Chyba pri odoberaní vyzbroje.");
  }
}

// =============================================================================
// AUTH HELPER
// =============================================================================

async function assertPermission(ctx: AuthContext, permission: Permission): Promise<void> {
  const ok =
    ctx.permissions.includes(permission) || (await hasPermissionServer(ctx.userId, permission));
  if (!ok) {
    throw createAuthError(403, "Nemate opravnenie na tuto operaciu.");
  }
}
