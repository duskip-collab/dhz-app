// Equipment Inspections Service - Server Authorization Layer
//
// Bezpecne server-side operacie pre Revizie, STK/EK, kontroly a servisy.
// Architektura: getAuthContext -> permission check -> Supabase RLS.
// Schema: 20261030_equipment_submodules.sql (equipment_inspections)

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateInspection,
  validateInspectionUpdate,
  type InspectionInput,
  type InspectionUpdate,
  type InspectionStatusValue,
  type InspectionTypeValue,
} from "./inspections.validation";

// =============================================================================
// TYPY
// =============================================================================

export interface EquipmentInspection {
  id: string;
  equipment_id: string;
  type: InspectionTypeValue;
  title: string;
  description: string | null;
  status: InspectionStatusValue;
  scheduled_date: string | null;
  performed_at: string | null;
  valid_until: string | null;
  performed_by: string | null;
  cost: number | null;
  protocol_number: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  equipment?: {
    id: string;
    name: string;
    inventory_number: string | null;
  } | null;
}

// =============================================================================
// AUTH GUARD
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
      throw createAuthError(401, "Prihlasenie vyprsalo alebo neplati.");
    }
    throw error;
  }
}

// =============================================================================
// READ – getInspections (zoznam s filtrami)
// Vyzaduje `inspection.view`.
// =============================================================================

const INSPECTION_EQUIPMENT_SELECT =
  "*, equipment:equipment_items!equipment_inspections_equipment_id_fkey(id, name, inventory_number)";

export async function getInspections(params: {
  status?: InspectionStatusValue;
  type?: InspectionTypeValue;
  equipment_id?: string;
  upcoming?: boolean;
  limit?: number;
} = {}): Promise<EquipmentInspection[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INSPECTION_VIEW);

  const supabase = await createClient();
  let query = supabase
    .from("equipment_inspections")
    .select(INSPECTION_EQUIPMENT_SELECT)
    .order("scheduled_date", { ascending: true, nullsFirst: false });

  if (params.status) query = query.eq("status", params.status);
  if (params.type) query = query.eq("type", params.type);
  if (params.equipment_id) query = query.eq("equipment_id", params.equipment_id);
  if (params.upcoming) {
    query = query.in("status", ["PLANNED", "SCHEDULED", "OVERDUE"]);
  }

  const limit = params.limit ?? 200;
  query = query.range(0, limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error("[getInspections] Supabase error:", error);
    throw createAuthError(500, "Chyba pri nacitavani revizii.");
  }
  return (data || []) as EquipmentInspection[];
}

// =============================================================================
// READ – getUpcomingInspections (bliziace sa terminy, 60 dni)
// Vyzaduje `inspection.view`.
// =============================================================================

export async function getUpcomingInspections(days = 60): Promise<EquipmentInspection[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INSPECTION_VIEW);

  const supabase = await createClient();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + days);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("equipment_inspections")
    .select(INSPECTION_EQUIPMENT_SELECT)
    .in("status", ["PLANNED", "SCHEDULED", "OVERDUE"])
    .not("scheduled_date", "is", null)
    .lte("scheduled_date", horizonStr)
    .order("scheduled_date", { ascending: true });

  if (error) {
    console.error("[getUpcomingInspections] Supabase error:", error);
    throw createAuthError(500, "Chyba pri nacitavani terminov.");
  }
  return (data || []) as EquipmentInspection[];
}

// =============================================================================
// WRITE – createInspection
// Vyzaduje `inspection.manage`.
// =============================================================================

export async function createInspection(input: InspectionInput): Promise<EquipmentInspection> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INSPECTION_MANAGE);

  const parsed = validateInspection(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatne udaje revizie.", parsed.errors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_inspections")
    .insert({ ...parsed.data, status: "PLANNED", created_by: ctx.userId } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[createInspection] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vytvarani revizie.");
  }
  return data as EquipmentInspection;
}

// =============================================================================
// WRITE – updateInspection
// Vyzaduje `inspection.manage`.
// =============================================================================

export async function updateInspection(
  inspectionId: string,
  input: InspectionUpdate
): Promise<EquipmentInspection> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INSPECTION_MANAGE);

  const parsed = validateInspectionUpdate(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatne udaje revizie.", parsed.errors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_inspections")
    .update(parsed.data as never)
    .eq("id", inspectionId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateInspection] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladani revizie.");
  }
  return data as EquipmentInspection;
}

// =============================================================================
// WRITE – deleteInspection
// Vyzaduje `inspection.manage`.
// =============================================================================

export async function deleteInspection(inspectionId: string): Promise<void> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INSPECTION_MANAGE);

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_inspections").delete().eq("id", inspectionId);

  if (error) {
    console.error("[deleteInspection] Supabase error:", error);
    throw createAuthError(500, "Chyba pri mazani revizie.");
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
