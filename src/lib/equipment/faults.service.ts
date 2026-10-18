// Equipment Faults Service - Server Authorization Layer
//
// Bezpecne server-side operacie pre Poruchy a hlasenia.
// Architektura: getAuthContext -> permission check -> Supabase RLS.
// Schema: 20261030_equipment_submodules.sql (equipment_faults)

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateFault,
  validateFaultUpdate,
  type FaultInput,
  type FaultUpdate,
  type FaultStatusValue,
} from "./faults.validation";

// =============================================================================
// TYPY
// =============================================================================

export interface EquipmentFault {
  id: string;
  equipment_id: string;
  title: string;
  description: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: FaultStatusValue;
  reported_by: string | null;
  assigned_to: string | null;
  resolved_at: string | null;
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

async function assertAnyPermission(ctx: AuthContext, permissions: Permission[]): Promise<void> {
  for (const p of permissions) {
    const ok = ctx.permissions.includes(p) || (await hasPermissionServer(ctx.userId, p));
    if (ok) return;
  }
  throw createAuthError(403, "Nemate opravnenie na tuto operaciu.");
}


// =============================================================================
// READ – getFaults (zoznam s filtrami)
// Vyzaduje `fault.create` ALEBO `fault.manage`.
// =============================================================================

const FAULT_EQUIPMENT_SELECT =
  "*, equipment:equipment_items!equipment_faults_equipment_id_fkey(id, name, inventory_number)";

export async function getFaults(params: {
  status?: FaultStatusValue;
  equipment_id?: string;
  open_only?: boolean;
  limit?: number;
} = {}): Promise<EquipmentFault[]> {
  const ctx = await requireAuthenticated();
  await assertAnyPermission(ctx, [PERMISSIONS.FAULT_CREATE, PERMISSIONS.FAULT_MANAGE]);

  const supabase = await createClient();
  let query = supabase
    .from("equipment_faults")
    .select(FAULT_EQUIPMENT_SELECT)
    .order("created_at", { ascending: false });

  if (params.status) query = query.eq("status", params.status);
  if (params.equipment_id) query = query.eq("equipment_id", params.equipment_id);
  if (params.open_only) query = query.in("status", ["REPORTED", "TRIAGED", "IN_PROGRESS"]);

  const limit = params.limit ?? 200;
  query = query.range(0, limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error("[getFaults] Supabase error:", error);
    throw createAuthError(500, "Chyba pri nacitavani poruch.");
  }
  return (data || []) as EquipmentFault[];
}

// =============================================================================
// READ – getFaultById
// Vyzaduje `fault.create` ALEBO `fault.manage`.
// =============================================================================

export async function getFaultById(faultId: string): Promise<EquipmentFault> {
  const ctx = await requireAuthenticated();
  await assertAnyPermission(ctx, [PERMISSIONS.FAULT_CREATE, PERMISSIONS.FAULT_MANAGE]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_faults")
    .select(FAULT_EQUIPMENT_SELECT)
    .eq("id", faultId)
    .single();

  if (error) {
    console.error("[getFaultById] Supabase error:", error);
    throw createAuthError(404, "Porucha sa nenasla.");
  }
  return data as EquipmentFault;
}

// =============================================================================
// WRITE – reportFault (hlasenie poruchy)
// Vyzaduje `fault.create`.
// =============================================================================

export async function reportFault(input: FaultInput): Promise<EquipmentFault> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.FAULT_CREATE);

  const parsed = validateFault(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatne udaje poruchy.", parsed.errors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_faults")
    .insert({ ...parsed.data, reported_by: ctx.userId, status: "REPORTED" } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[reportFault] Supabase error:", error);
    throw createAuthError(500, "Chyba pri nahlasovani poruchy.");
  }
  return data as EquipmentFault;
}

// =============================================================================
// WRITE – updateFault (zmena stavu, priority, riesitela)
// Vyzaduje `fault.manage`.
// =============================================================================

export async function updateFault(faultId: string, input: FaultUpdate): Promise<EquipmentFault> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.FAULT_MANAGE);

  const parsed = validateFaultUpdate(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatne udaje poruchy.", parsed.errors);
  }

  const payload: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "RESOLVED" || parsed.data.status === "CLOSED") {
    payload.resolved_at = new Date().toISOString();
  } else if (parsed.data.status) {
    payload.resolved_at = null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_faults")
    .update(payload as never)
    .eq("id", faultId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateFault] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladani poruchy.");
  }
  return data as EquipmentFault;
}

// =============================================================================
// WRITE – deleteFault
// Vyzaduje `fault.manage`.
// =============================================================================

export async function deleteFault(faultId: string): Promise<void> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.FAULT_MANAGE);

  const supabase = await createClient();
  const { error } = await supabase.from("equipment_faults").delete().eq("id", faultId);

  if (error) {
    console.error("[deleteFault] Supabase error:", error);
    throw createAuthError(500, "Chyba pri mazani poruchy.");
  }
}

async function assertPermission(ctx: AuthContext, permission: Permission): Promise<void> {
  const ok =
    ctx.permissions.includes(permission) || (await hasPermissionServer(ctx.userId, permission));
  if (!ok) {
    throw createAuthError(403, "Nemate opravnenie na tuto operaciu.");
  }
}
