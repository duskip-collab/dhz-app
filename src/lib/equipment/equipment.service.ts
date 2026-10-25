// Equipment, Vehicles & Inventory Service - Server Authorization Layer
// K11.2 – Equipment Server Access Layer & Actions
//
// Bezpečné server-side operácie pre modul Technika, Výstroj a Majetok.
// Architektúra: getAuthContext -> permission check -> Supabase RLS.
// RLS zostáva druhou bezpečnostnou vrstvou (defense-in-depth).
//
// Schéma: 20261012_equipment_module.sql (K11.1)

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import {
  auditEquipmentItem,
  auditEquipmentAssignment,
  auditEquipmentMaintenance,
} from "@/lib/audit/audit.service";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateEquipmentItem,
  validateVehicleDetails,
  validateEquipmentAssignment,
  validateMaintenanceLog,
  isEquipmentCondition,
  type EquipmentItemInput,
  type VehicleDetailsInput,
  type MaintenanceLogInput,
  type EquipmentCondition,
} from "./equipment.validation";

export type {
  EquipmentStatus,
  EquipmentCondition,
  MaintenanceType,
} from "./equipment.validation";

// =============================================================================
// TYPY (zrkadlia schému K11.1)
// =============================================================================

export interface EquipmentCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  requires_inspection: boolean;
  created_at: string;
  updated_at: string;
}

export interface EquipmentItem {
  id: string;
  category_id: string;
  name: string;
  inventory_number: string | null;
  serial_number: string | null;
  status: "AVAILABLE" | "IN_SERVICE" | "RESERVED" | "DAMAGED" | "DISPOSED";
  condition: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE";
  location: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  next_inspection_date: string | null;
  quantity: number;
  is_opp: boolean;
  photo_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleDetails {
  id: string;
  license_plate: string | null;
  vin: string | null;
  fuel_type: string | null;
  mileage_km: number;
  engine_hours: number;
  stk_valid_until: string | null;
  ek_valid_until: string | null;
}

export interface AssignmentMember {
  id: string;
  first_name: string;
  last_name: string;
  member_number: string;
  phone?: string | null;
  email?: string | null;
}

export interface EquipmentAssignment {
  id: string;
  equipment_id: string;
  member_id: string;
  assigned_at: string;
  returned_at: string | null;
  assigned_by: string | null;
  condition_on_assign: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE" | null;
  condition_on_return: "NEW" | "GOOD" | "FAIR" | "POOR" | "UNSERVICEABLE" | null;
  notes: string | null;
  created_at: string;
  member?: AssignmentMember | null;
}

export interface MaintenanceLog {
  id: string;
  equipment_id: string;
  type: "STK_EK" | "REVISION" | "SERVICE_CHECK" | "REPAIR" | "INSPECTION";
  title: string;
  description: string | null;
  performed_at: string;
  next_due_date: string | null;
  cost: number;
  performed_by: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
}

export interface EquipmentItemDetail extends EquipmentItem {
  category: EquipmentCategory | null;
  vehicle_details: VehicleDetails | null;
  current_assignment: EquipmentAssignment | null;
  recent_maintenance: MaintenanceLog[];
}

export interface ListEquipmentParams {
  category_id?: string;
  status?: EquipmentItem["status"];
  search?: string;
  location?: string;
  expiry_warning?: boolean; // len položky s next_inspection_date v horizonte
  limit?: number;
  offset?: number;
}

// =============================================================================
// AUTHENTICATION GUARD
// =============================================================================

async function requireAuthenticated(): Promise<AuthContext> {
  try {
    const ctx = await getAuthContext();
    return ctx;
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

async function assertPermission(ctx: AuthContext, permission: Permission): Promise<void> {
  const ok =
    ctx.permissions.includes(permission) || (await hasPermissionServer(ctx.userId, permission));
  if (!ok) {
    throw createAuthError(403, "Nemáte oprávnenie na túto operáciu.");
  }
}

const ASSIGN_MEMBER_SELECT =
  "*, member:members!equipment_assignments_member_id_fkey(id, first_name, last_name, member_number, phone, email)";

/**
 * InventoryAvailabilityRow – prepočet kusov položky.
 * available = quantity (celkom) − počet aktívnych (nevrátených) výdajov.
 */
export interface InventoryAvailability {
  total: number;
  assigned: number;
  available: number;
}

// =============================================================================
// READ – getInventoryAvailability
// Vyžaduje `inventory.view`. Vráti mapu equipmentId -> počty kusov.
// =============================================================================

export async function getInventoryAvailability(): Promise<Record<string, InventoryAvailability>> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();

  const [itemsRaw, assignedRaw] = await Promise.all([
    supabase.from("equipment_items").select("id, quantity, status"),
    supabase
      .from("equipment_assignments")
      .select("equipment_id")
      .is("returned_at", null),
  ]);

  const items = itemsRaw.data ?? [];
  const assigned = assignedRaw.data ?? [];

  if (itemsRaw.error || assignedRaw.error) {
    console.error("[getInventoryAvailability] Supabase error:", itemsRaw.error ?? assignedRaw.error);
    throw createAuthError(500, "Chyba pri výpočte dostupnosti inventára.");
  }

  const countMap: Record<string, number> = {};
  for (const row of assigned) {
    countMap[row.equipment_id] = (countMap[row.equipment_id] ?? 0) + 1;
  }

  const result: Record<string, InventoryAvailability> = {};
  for (const item of items) {
    const total = item.quantity ?? 1;
    const assignedCount = countMap[item.id] ?? 0;
    result[item.id] = {
      total,
      assigned: assignedCount,
      available: Math.max(0, total - assignedCount),
    };
  }

  return result;
}

// =============================================================================
// READ – getItemAssignmentHistory
// Vyžaduje `inventory.view`. História priradení položky vrátane člena.
// =============================================================================

export async function getItemAssignmentHistory(
  equipmentId: string
): Promise<EquipmentAssignment[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_assignments")
    .select(ASSIGN_MEMBER_SELECT)
    .eq("equipment_id", equipmentId)
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("[getItemAssignmentHistory] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní priradení položky.");
  }

  return (data || []) as EquipmentAssignment[];
}

// =============================================================================
// READ – getCategories
// Vyžaduje `inventory.view`.
// =============================================================================

export async function getCategories(): Promise<EquipmentCategory[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_categories")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("[getCategories] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní kategórií.");
  }

  return (data || []) as EquipmentCategory[];
}

// =============================================================================
// READ – getEquipmentItems
// Vyžaduje `inventory.view`. Filtre: category_id, status, search, location,
// expiry_warning (next_inspection_date do 30 dní).
// =============================================================================

export async function getEquipmentItems(
  params: ListEquipmentParams = {}
): Promise<EquipmentItem[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();

  let query = supabase
    .from("equipment_items")
    .select("*")
    .order("name", { ascending: true });

  if (params.category_id) query = query.eq("category_id", params.category_id);
  if (params.status) query = query.eq("status", params.status);
  if (params.location) query = query.eq("location", params.location);

  if (params.search && params.search.trim().length > 0) {
    const q = params.search.trim();
    query = query.or(
      `name.ilike.*${q}*,inventory_number.ilike.*${q}*,serial_number.ilike.*${q}*`
    );
  }

  if (params.expiry_warning) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 30);
    query = query
      .not("next_inspection_date", "is", null)
      .lte("next_inspection_date", horizon.toISOString().slice(0, 10));
  }

  const limit = params.limit ?? 200;
  const offset = params.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    console.error("[getEquipmentItems] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní položiek inventára.");
  }

  return (data || []) as EquipmentItem[];
}


// =============================================================================
// READ – getEquipmentById
// Vyžaduje `inventory.view`. Detail + vehicle_details + aktívny assignment +
// posledných 5 maintenance logs.
// =============================================================================

export async function getEquipmentById(equipmentId: string): Promise<EquipmentItemDetail> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("equipment_items")
    .select("*, category:equipment_categories(*)")
    .eq("id", equipmentId)
    .single();

  if (error) {
    console.error("[getEquipmentById] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Položka sa nenašla.");
    throw createAuthError(500, "Chyba pri načítavaní položky.");
  }

  const item = data as EquipmentItem & { category: EquipmentCategory | null };

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicle_details")
    .select("*")
    .eq("id", equipmentId)
    .maybeSingle();
  if (vehicleError) {
    console.error("[getEquipmentById] vehicle_details error:", vehicleError);
    throw createAuthError(500, "Chyba pri načítavaní údajov vozidla.");
  }

  const { data: assignment, error: assignError } = await supabase
    .from("equipment_assignments")
    .select(ASSIGN_MEMBER_SELECT)
    .eq("equipment_id", equipmentId)
    .is("returned_at", null)
    .maybeSingle();
  if (assignError) {
    console.error("[getEquipmentById] assignment error:", assignError);
    throw createAuthError(500, "Chyba pri načítavaní výdaja.");
  }

  const { data: maintenance, error: maintError } = await supabase
    .from("equipment_maintenance_logs")
    .select("*")
    .eq("equipment_id", equipmentId)
    .order("performed_at", { ascending: false })
    .limit(5);
  if (maintError) {
    console.error("[getEquipmentById] maintenance error:", maintError);
    throw createAuthError(500, "Chyba pri načítavaní údržby.");
  }

  return {
    ...item,
    category: item.category ?? null,
    vehicle_details: (vehicle as VehicleDetails | null) ?? null,
    current_assignment: (assignment as EquipmentAssignment | null) ?? null,
    recent_maintenance: (maintenance || []) as MaintenanceLog[],
  };
}

// =============================================================================
// READ – getExpiringEquipment
// Vyžaduje `inventory.view`. Položky s blízkym termínom kontroly/STK/EK.
// =============================================================================

export async function getExpiringEquipment(days = 30): Promise<EquipmentItem[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + days);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("equipment_items")
    .select("*")
    .not("next_inspection_date", "is", null)
    .lte("next_inspection_date", horizonStr)
    .neq("status", "DISPOSED")
    .order("next_inspection_date", { ascending: true });

  if (error) {
    console.error("[getExpiringEquipment] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní blížiacich sa kontrol.");
  }

  return (data || []) as EquipmentItem[];
}

// =============================================================================
// READ – getMemberAssignments
// Vyžaduje `inventory.view`. História + aktívny výstroj člena.
// =============================================================================

export async function getMemberAssignments(memberId: string): Promise<EquipmentAssignment[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_assignments")
    .select(ASSIGN_MEMBER_SELECT)
    .eq("member_id", memberId)
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("[getMemberAssignments] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní výdajov člena.");
  }

  return (data || []) as EquipmentAssignment[];
}


// =============================================================================
// WRITE – createEquipmentItem (s voliteľným vehicle_details)
// Vyžaduje `inventory.edit`.
// =============================================================================

export async function createEquipmentItem(
  data: EquipmentItemInput,
  vehicle?: VehicleDetailsInput | null
): Promise<EquipmentItem> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_EDIT);

  const parsed = validateEquipmentItem(data);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje položky.", parsed.errors);
  }

  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from("equipment_items")
    .insert({
      ...parsed.data,
      created_by: ctx.userId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[createEquipmentItem] Supabase error:", error);
    if (error.code === "23505") {
      throw createAuthError(409, "Inventárne číslo už existuje.");
    }
    throw createAuthError(500, "Chyba pri vytváraní položky.");
  }

  const item = created as EquipmentItem;

  // Voliteľné údaje vozidla (1:1, zdieľaný PK = item.id).
  if (vehicle) {
    const parsedVehicle = validateVehicleDetails(vehicle);
    if (!parsedVehicle.ok) {
      throw createAuthError(400, "Neplatné údaje vozidla.", parsedVehicle.errors);
    }
    const { error: vErr } = await supabase
      .from("vehicle_details")
      .insert({ id: item.id, ...parsedVehicle.data });
    if (vErr) {
      console.error("[createEquipmentItem] vehicle_details error:", vErr);
      if (vErr.code === "23505") {
        throw createAuthError(409, "EČV alebo VIN už existuje.");
      }
      throw createAuthError(500, "Chyba pri ukladaní údajov vozidla.");
    }
  }

  await auditEquipmentItem(ctx.userId, "create", item.id, {
    name: item.name,
    category_id: item.category_id,
    status: item.status,
  });
  return item;
}

// =============================================================================
// WRITE – updateEquipmentItem
// Vyžaduje `inventory.edit`.
// =============================================================================

export async function updateEquipmentItem(
  equipmentId: string,
  data: Partial<EquipmentItemInput>,
  vehicle?: VehicleDetailsInput | null
): Promise<EquipmentItem> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_EDIT);

  // Validujeme ako create (všetky polia), keďže formulár posiela kompletný stav.
  const parsed = validateEquipmentItem({
    category_id: data.category_id ?? "",
    name: data.name ?? "",
    inventory_number: data.inventory_number ?? null,
    serial_number: data.serial_number ?? null,
    status: data.status,
    condition: data.condition,
    location: data.location ?? null,
    purchase_date: data.purchase_date ?? null,
    purchase_price: data.purchase_price ?? null,
    next_inspection_date: data.next_inspection_date ?? null,
    quantity: data.quantity,
    is_opp: data.is_opp,
    notes: data.notes ?? null,
  });
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje položky.", parsed.errors);
  }

  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("equipment_items")
    .update({ ...parsed.data })
    .eq("id", equipmentId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateEquipmentItem] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Položka sa nenašla.");
    if (error.code === "23505") throw createAuthError(409, "Inventárne číslo už existuje.");
    throw createAuthError(500, "Chyba pri ukladaní položky.");
  }

  const item = updated as EquipmentItem;

  if (vehicle) {
    const parsedVehicle = validateVehicleDetails(vehicle);
    if (!parsedVehicle.ok) {
      throw createAuthError(400, "Neplatné údaje vozidla.", parsedVehicle.errors);
    }
    const { error: vErr } = await supabase
      .from("vehicle_details")
      .upsert({ id: item.id, ...parsedVehicle.data });
    if (vErr) {
      console.error("[updateEquipmentItem] vehicle_details error:", vErr);
      if (vErr.code === "23505") throw createAuthError(409, "EČV alebo VIN už existuje.");
      throw createAuthError(500, "Chyba pri ukladaní údajov vozidla.");
    }
  }

  await auditEquipmentItem(ctx.userId, "update", equipmentId, parsed.data);
  return item;
}


// =============================================================================
// WRITE – assignEquipmentToMember
// Vyžaduje `inventory.edit`. Vytvorí assignment a prepne stav na IN_SERVICE.
// =============================================================================

export async function assignEquipmentToMember(
  equipmentId: string,
  memberId: string,
  condition?: EquipmentItemInput["condition"] | null,
  notes?: string | null
): Promise<EquipmentAssignment> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_EDIT);

  const parsed = validateEquipmentAssignment({
    equipment_id: equipmentId,
    member_id: memberId,
    condition_on_assign: condition ?? null,
    notes: notes ?? null,
  });
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje výdaja.", parsed.errors);
  }

  const supabase = await createClient();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id")
    .eq("id", parsed.data.member_id)
    .maybeSingle();
  if (memberError) {
    console.error("[assignEquipmentToMember] member check error:", memberError);
    throw createAuthError(500, "Chyba pri kontrole člena.");
  }
  if (!member) throw createAuthError(404, "Člen sa nenašiel.");

  const { data, error } = await supabase
    .from("equipment_assignments")
    .insert({
      equipment_id: parsed.data.equipment_id,
      member_id: parsed.data.member_id,
      assigned_by: ctx.userId,
      condition_on_assign: parsed.data.condition_on_assign,
      notes: parsed.data.notes,
    })
    .select(ASSIGN_MEMBER_SELECT)
    .single();

  if (error) {
    console.error("[assignEquipmentToMember] Supabase error:", error);
    throw createAuthError(500, "Chyba pri výdaji položky.");
  }

  const { error: statusError } = await supabase
    .from("equipment_items")
    .update({ status: "IN_SERVICE" })
    .eq("id", parsed.data.equipment_id);
  if (statusError) {
    console.error("[assignEquipmentToMember] status update error:", statusError);
  }

  const assignment = data as EquipmentAssignment;
  await auditEquipmentAssignment(ctx.userId, "assign", assignment.id, {
    equipment_id: assignment.equipment_id,
    member_id: assignment.member_id,
  });
  return assignment;
}

// =============================================================================
// WRITE – returnEquipmentFromMember
// Vyžaduje `inventory.edit`. Nastaví returned_at + condition_on_return a
// vráti stav položky na AVAILABLE (alebo DAMAGED pri UNSERVICEABLE).
// =============================================================================

export async function returnEquipmentFromMember(
  assignmentId: string,
  returnCondition?: EquipmentItemInput["condition"] | null,
  notes?: string | null
): Promise<EquipmentAssignment> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_EDIT);

  const supabase = await createClient();

  const update: {
    returned_at: string;
    condition_on_return?: EquipmentCondition;
    notes?: string | null;
  } = { returned_at: new Date().toISOString() };
  if (returnCondition !== undefined && returnCondition !== null) {
    if (!isEquipmentCondition(returnCondition)) {
      throw createAuthError(400, "Neplatný stav opotrebovania.");
    }
    update.condition_on_return = returnCondition;
  }
  if (notes !== undefined && notes !== null) update.notes = notes;

  const { data, error } = await supabase
    .from("equipment_assignments")
    .update(update)
    .eq("id", assignmentId)
    .select(ASSIGN_MEMBER_SELECT)
    .single();

  if (error) {
    console.error("[returnEquipmentFromMember] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Výdaj sa nenašiel.");
    throw createAuthError(500, "Chyba pri návrate položky.");
  }

  const assignment = data as EquipmentAssignment;

  const itemStatus = returnCondition === "UNSERVICEABLE" ? "DAMAGED" : "AVAILABLE";
  const { error: statusError } = await supabase
    .from("equipment_items")
    .update({
      status: itemStatus,
      ...(returnCondition ? { condition: returnCondition } : {}),
    })
    .eq("id", assignment.equipment_id);
  if (statusError) {
    console.error("[returnEquipmentFromMember] status update error:", statusError);
  }

  await auditEquipmentAssignment(ctx.userId, "return", assignmentId, {
    equipment_id: assignment.equipment_id,
    condition_on_return: returnCondition ?? null,
  });
  return assignment;
}


// =============================================================================
// WRITE – deleteEquipmentItem
// Vyžaduje `inventory.manage`. Vymaže položku a súvisiace záznamy.
// =============================================================================

export async function deleteEquipmentItem(equipmentId: string): Promise<void> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_MANAGE);

  const supabase = await createClient();

  // Skontrolujeme, či položka existuje.
  const { data: item, error: itemError } = await supabase
    .from("equipment_items")
    .select("id, name")
    .eq("id", equipmentId)
    .maybeSingle();
  if (itemError) {
    console.error("[deleteEquipmentItem] item check error:", itemError);
    throw createAuthError(500, "Chyba pri kontrole položky.");
  }
  if (!item) throw createAuthError(404, "Položka sa nenašla.");

  // Vymažeme súvisiace záznamy (RLS/cascade by mal pomôcť, ale explicitne to zabezpečíme).
  await supabase.from("equipment_maintenance_logs").delete().eq("equipment_id", equipmentId);
  await supabase.from("equipment_assignments").delete().eq("equipment_id", equipmentId);
  await supabase.from("vehicle_details").delete().eq("id", equipmentId);

  const { error } = await supabase.from("equipment_items").delete().eq("id", equipmentId);
  if (error) {
    console.error("[deleteEquipmentItem] Supabase error:", error);
    throw createAuthError(500, "Chyba pri mazácii položky.");
  }

  // Zmenené z "delete" na povolenú hodnotu "dispose"
  await auditEquipmentItem(ctx.userId, "dispose", equipmentId, {
    id: item.id,
    name: item.name,
  });
}

// =============================================================================
// WRITE – addMaintenanceLog
// Vyžaduje `inventory.edit`. Zapíše záznam údržby a (ak je zadaný termín)
// aktualizuje next_inspection_date položky.
// =============================================================================

export async function addMaintenanceLog(
  equipmentId: string,
  logData: MaintenanceLogInput
): Promise<MaintenanceLog> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_EDIT);

  const parsed = validateMaintenanceLog(logData);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje údržby.", parsed.errors);
  }

  const supabase = await createClient();

  const { data: item, error: itemError } = await supabase
    .from("equipment_items")
    .select("id")
    .eq("id", equipmentId)
    .maybeSingle();
  if (itemError) {
    console.error("[addMaintenanceLog] item check error:", itemError);
    throw createAuthError(500, "Chyba pri kontrole položky.");
  }
  if (!item) throw createAuthError(404, "Položka sa nenašla.");

  const { data, error } = await supabase
    .from("equipment_maintenance_logs")
    .insert({
      equipment_id: equipmentId,
      ...parsed.data,
      created_by: ctx.userId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[addMaintenanceLog] Supabase error:", error);
    throw createAuthError(500, "Chyba pri zápise údržby.");
  }

  if (parsed.data.next_due_date) {
    const { error: updError } = await supabase
      .from("equipment_items")
      .update({ next_inspection_date: parsed.data.next_due_date })
      .eq("id", equipmentId);
    if (updError) {
      console.error("[addMaintenanceLog] next_inspection_date update error:", updError);
    }
  }

  const log = data as MaintenanceLog;
  await auditEquipmentMaintenance(ctx.userId, equipmentId, {
    type: log.type,
    title: log.title,
    performed_at: log.performed_at,
  });
  return log;
}

// =============================================================================
// READ – getMaintenanceLogs
// Vyžaduje `inventory.view`. Kompletná história údržby položky.
// =============================================================================

export async function getMaintenanceLogs(equipmentId: string): Promise<MaintenanceLog[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_maintenance_logs")
    .select("*")
    .eq("equipment_id", equipmentId)
    .order("performed_at", { ascending: false });

  if (error) {
    console.error("[getMaintenanceLogs] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní histórie údržby.");
  }

  return (data || []) as MaintenanceLog[];
}

// =============================================================================
// READ – getAllAssignments
// Vyžaduje `inventory.view`. Voliteľné filtre: member_id, active (len
// nevrátené priradenia). Vráti aj člena a názov/inventárne číslo položky.
// =============================================================================

export interface AssignmentWithDetails extends EquipmentAssignment {
  equipment?: {
    id: string;
    name: string;
    inventory_number: string | null;
  } | null;
}

const ASSIGN_FULL_SELECT =
  "*, member:members!equipment_assignments_member_id_fkey(id, first_name, last_name, member_number), equipment:equipment_items!equipment_assignments_equipment_id_fkey(id, name, inventory_number)";

export async function getAllAssignments(params: {
  member_id?: string;
  active?: boolean;
  limit?: number;
} = {}): Promise<AssignmentWithDetails[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();

  let query = supabase
    .from("equipment_assignments")
    .select(ASSIGN_FULL_SELECT)
    .order("assigned_at", { ascending: false });

  if (params.member_id) query = query.eq("member_id", params.member_id);
  if (params.active) query = query.is("returned_at", null);

  const limit = params.limit ?? 200;
  query = query.range(0, limit - 1);

  const { data, error } = await query;

  if (error) {
    console.error("[getAllAssignments] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní priradení.");
  }

  return (data || []) as AssignmentWithDetails[];
}

// =============================================================================
// READ – getEquipmentPhotoUrl
// Vyžaduje `inventory.view`. Podpísaná URL fotografie položky (bucket equipment-photos).
// =============================================================================

const EQUIPMENT_PHOTO_BUCKET = "equipment-photos";

/**
 * Vráti podpísanú URL fotografie položky alebo NULL.
 */
export async function getEquipmentPhotoUrl(
  photoPath: string | null
): Promise<string | null> {
  if (!photoPath) return null;

  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from(EQUIPMENT_PHOTO_BUCKET)
    .createSignedUrl(photoPath, 60 * 10);

  if (error) {
    console.error("[getEquipmentPhotoUrl] Supabase error:", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

// =============================================================================
// WRITE – createEquipmentCategory
// Vyžaduje `inventory.manage`.
// =============================================================================

export async function createEquipmentCategory(input: {
  name: string;
  code: string;
  description?: string | null;
  requires_inspection?: boolean;
}): Promise<EquipmentCategory> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_MANAGE);

  const name = (input.name ?? "").trim();
  const code = (input.code ?? "").trim().toUpperCase();
  if (!name) throw createAuthError(400, "Názov kategórie je povinný.");
  if (!code) throw createAuthError(400, "Kód kategórie je povinný.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_categories")
    .insert({
      name,
      code,
      description: (input.description ?? "").trim() || null,
      requires_inspection: input.requires_inspection ?? false,
    } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[createEquipmentCategory] Supabase error:", error);
    if (error.code === "23505") throw createAuthError(409, "Kód kategórie už existuje.");
    throw createAuthError(500, "Chyba pri vytváraní kategórie.");
  }

  return data as EquipmentCategory;
}

// =============================================================================
// WRITE – updateEquipmentCategory
// Vyžaduje `inventory.manage`.
// =============================================================================

export async function updateEquipmentCategory(
  categoryId: string,
  input: {
    name?: string;
    code?: string;
    description?: string | null;
    requires_inspection?: boolean;
  }
): Promise<EquipmentCategory> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_MANAGE);

  const update: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw createAuthError(400, "Názov kategórie je povinný.");
    update.name = name;
  }
  if (input.code !== undefined) {
    const code = input.code.trim().toUpperCase();
    if (!code) throw createAuthError(400, "Kód kategórie je povinný.");
    update.code = code;
  }
  if (input.description !== undefined) {
    update.description = (input.description ?? "").trim() || null;
  }
  if (input.requires_inspection !== undefined) {
    update.requires_inspection = input.requires_inspection;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_categories")
    .update(update as never)
    .eq("id", categoryId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateEquipmentCategory] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Kategória sa nenašla.");
    if (error.code === "23505") throw createAuthError(409, "Kód kategórie už existuje.");
    throw createAuthError(500, "Chyba pri ukladaní kategórie.");
  }

  return data as EquipmentCategory;
}

// =============================================================================
// WRITE – deleteEquipmentCategory
// Vyžaduje `inventory.manage`. Zlyhá, ak kategória obsahuje položky.
// =============================================================================

export async function deleteEquipmentCategory(categoryId: string): Promise<void> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_MANAGE);

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("equipment_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  if (countError) {
    console.error("[deleteEquipmentCategory] count error:", countError);
    throw createAuthError(500, "Chyba pri kontrole kategórie.");
  }
  if (count && count > 0) {
    throw createAuthError(
      409,
      `Kategória obsahuje ${count} položiek. Najprv ich presuňte alebo vymažte.`
    );
  }

  const { error } = await supabase.from("equipment_categories").delete().eq("id", categoryId);
  if (error) {
    console.error("[deleteEquipmentCategory] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Kategória sa nenašla.");
    throw createAuthError(500, "Chyba pri mazaní kategórie.");
  }
}