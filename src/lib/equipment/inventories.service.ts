// Inventory Checks Service - Server Authorization Layer
//
// Bezpecne server-side operacie pre Inventarizaciu.
// Architektura: getAuthContext -> permission check -> Supabase RLS.
// Schema: 20261030_equipment_submodules.sql (inventory_checks + items)

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateInventoryCheck,
  validateInventoryCheckUpdate,
  validateInventoryCheckItem,
  type InventoryCheckInput,
  type InventoryCheckUpdate,
  type InventoryCheckItemVerify,
  type InventoryCheckStatusValue,
} from "./inventories.validation";

// =============================================================================
// TYPY
// =============================================================================

export interface InventoryCheck {
  id: string;
  title: string;
  description: string | null;
  status: InventoryCheckStatusValue;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryCheckItem {
  id: string;
  check_id: string;
  equipment_id: string;
  found: boolean | null;
  condition_found: string | null;
  notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  equipment?: {
    id: string;
    name: string;
    inventory_number: string | null;
    status: string;
  } | null;
}

export interface InventoryCheckDetail extends InventoryCheck {
  items: InventoryCheckItem[];
  total: number;
  verified: number;
  found_count: number;
  missing_count: number;
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
// READ – getInventoryChecks (zoznam kontrol)
// Vyzaduje `inventory.view`.
// =============================================================================

export async function getInventoryChecks(): Promise<InventoryCheck[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_checks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getInventoryChecks] Supabase error:", error);
    throw createAuthError(500, "Chyba pri nacitavani inventarizacii.");
  }
  return (data || []) as InventoryCheck[];
}

// =============================================================================
// READ – getInventoryCheckById (kontrola + polozky + statistika)
// Vyzaduje `inventory.view`.
// =============================================================================

const CHECK_ITEM_SELECT =
  "*, equipment:equipment_items!inventory_check_items_equipment_id_fkey(id, name, inventory_number, status)";

export async function getInventoryCheckById(checkId: string): Promise<InventoryCheckDetail> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_VIEW);

  const supabase = await createClient();
  const { data: check, error: checkError } = await supabase
    .from("inventory_checks")
    .select("*")
    .eq("id", checkId)
    .single();

  if (checkError) {
    console.error("[getInventoryCheckById] Supabase error:", checkError);
    throw createAuthError(404, "Inventarizacia sa nenasla.");
  }

  const { data: items, error: itemsError } = await supabase
    .from("inventory_check_items")
    .select(CHECK_ITEM_SELECT)
    .eq("check_id", checkId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    console.error("[getInventoryCheckById] items error:", itemsError);
    throw createAuthError(500, "Chyba pri nacitavani poloziek kontroly.");
  }
  const list = (items || []) as InventoryCheckItem[];
  const verified = list.filter((i) => i.found !== null);
  return {
    ...(check as InventoryCheck),
    items: list,
    total: list.length,
    verified: verified.length,
    found_count: verified.filter((i) => i.found === true).length,
    missing_count: verified.filter((i) => i.found === false).length,
  };
}



// =============================================================================
// WRITE – createInventoryCheck (snapshot poloziek z equipment_items)
// Vyzaduje `inventory.edit`.
// =============================================================================

export async function createInventoryCheck(input: InventoryCheckInput): Promise<InventoryCheck> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_EDIT);

  const parsed = validateInventoryCheck(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatne udaje kontroly.", parsed.errors);
  }

  const supabase = await createClient();
  const { data: check, error } = await supabase
    .from("inventory_checks")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: "DRAFT",
      created_by: ctx.userId,
    } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[createInventoryCheck] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vytvarani kontroly.");
  }

  const created = check as InventoryCheck;

  const { data: items, error: itemsError } = await supabase
    .from("equipment_items")
    .select("id")
    .neq("status", "DISPOSED");

  if (itemsError) {
    console.error("[createInventoryCheck] snapshot error:", itemsError);
    return created;
  }

  const rows = ((items || []) as { id: string }[]).map((i) => ({
    check_id: created.id,
    equipment_id: i.id,
    found: null,
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("inventory_check_items")
      .insert(rows as never);
    if (insertError) {
      console.error("[createInventoryCheck] snapshot insert error:", insertError);
    }
  }

  return created;
}

// =============================================================================
// WRITE – updateInventoryCheck (start/complete/cancel)
// Vyzaduje `inventory.edit`.
// =============================================================================

export async function updateInventoryCheck(
  checkId: string,
  input: { status?: InventoryCheckStatusValue; title?: string; description?: string | null }
): Promise<InventoryCheck> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_EDIT);

  const parsed = validateInventoryCheckUpdate(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatne udaje kontroly.", parsed.errors);
  }

  const payload: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "IN_PROGRESS") {
    payload.started_at = new Date().toISOString();
  }
  if (parsed.data.status === "COMPLETED") {
    payload.completed_at = new Date().toISOString();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_checks")
    .update(payload as never)
    .eq("id", checkId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateInventoryCheck] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladani kontroly.");
  }
  return data as InventoryCheck;
}

// =============================================================================
// WRITE – verifyInventoryItem (fyzicke overenie polozky)
// Vyzaduje `inventory.edit`.
// =============================================================================

export async function verifyInventoryItem(
  input: InventoryCheckItemVerify
): Promise<InventoryCheckItem> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_EDIT);

  const parsed = validateInventoryCheckItem(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatne udaje overenia.", parsed.errors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_check_items")
    .update({
      found: parsed.data.found,
      condition_found: parsed.data.condition_found ?? null,
      notes: parsed.data.notes ?? null,
      verified_by: ctx.userId,
      verified_at: new Date().toISOString(),
    } as never)
    .eq("check_id", parsed.data.check_id)
    .eq("equipment_id", parsed.data.equipment_id)
    .select("*")
    .single();

  if (error) {
    console.error("[verifyInventoryItem] Supabase error:", error);
    throw createAuthError(500, "Chyba pri overovani polozky.");
  }
  return data as InventoryCheckItem;
}

// =============================================================================
// WRITE – deleteInventoryCheck
// Vyzaduje `inventory.manage`.
// =============================================================================

export async function deleteInventoryCheck(checkId: string): Promise<void> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.INVENTORY_MANAGE);

  const supabase = await createClient();
  await supabase.from("inventory_check_items").delete().eq("check_id", checkId);
  const { error } = await supabase.from("inventory_checks").delete().eq("id", checkId);

  if (error) {
    console.error("[deleteInventoryCheck] Supabase error:", error);
    throw createAuthError(500, "Chyba pri mazani kontroly.");
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
