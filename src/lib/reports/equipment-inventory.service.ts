// Equipment Inventory Report — Server Service
// K13.3.2 – Prevádzkové reporty (Inventár a výzbroj)
//
// Serverová implementácia reportu `inventory-status` (Prehľad inventára).
//
// Finančné údaje (purchase_price, purchase_date, hodnota majetku) sa tu
// NIKDY nečítajú — select uvádza výslovne len ne-finančné stĺpce.
// Bezpečnostný model (defense-in-depth):
//   1) `getAuthContext()` overí prihlásenie (neprihlásený → redirect /login),
//   2) explicitná AND kontrola — report vyžaduje `reports.view` **A**
//      `inventory.view`. `reports.view` samotné NESTAČÍ (pozri katalóg),
//   3) čítanie prebieha cez štandardný serverový Supabase klient (RLS) —
//      NEPOUŽÍVA service-role, neobchádza RLS.

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermissionServer } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { createAuthError } from "@/lib/members/members.errors";
import {
  summarizeEquipment,
  type EquipmentSummaryRow,
  type EquipmentInventorySummary,
} from "./reports.core";

// Pre-re-export typu pre UI (stránka importuje summary typ odtiaľto).
export type { EquipmentInventorySummary } from "./reports.core";

/** Oprávnenia potrebné na tento report (logika AND). */
const EQUIPMENT_INVENTORY_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.INVENTORY_VIEW,
];

/** Riadok reportu inventára pre UI tabuľku (len ne-finančné polia). */
export interface EquipmentInventoryItem {
  id: string;
  name: string;
  status: string;
  location: string | null;
  categoryName: string | null;
}

/** Kompletný výsledok reportu: súhrn + riadky pre tabuľku. */
export interface EquipmentInventoryReport {
  summary: EquipmentInventorySummary;
  items: readonly EquipmentInventoryItem[];
}

/**
 * Overí, že prihlásený používateľ má VŠETKY oprávnenia reportu.
 * Kontrola je AND — chýbajúce hociktoré oprávnenie = zamietnutie.
 * Defense-in-depth: okrem kontextu sa overí aj cez RPC `has_permission`.
 */
async function authorizeEquipmentInventory(): Promise<void> {
  const ctx = await getAuthContext();

  const missing = EQUIPMENT_INVENTORY_PERMISSIONS.filter(
    (permission) => !ctx.permissions.includes(permission),
  );
  if (missing.length > 0) {
    throw createAuthError(403, "Nemáte oprávnenie na tento report.");
  }

  // Druhá línia obrany — potvrdenie cez server RPC pre obe oprávnenia.
  for (const permission of EQUIPMENT_INVENTORY_PERMISSIONS) {
    const allowed = await hasPermissionServer(ctx.userId, permission);
    if (!allowed) {
      throw createAuthError(403, "Nemáte oprávnenie na tento report.");
    }
  }
}

/**
 * Vráti prehľad inventára a výzbroje (súhrn + riadky tabuľky).
 * Prázdny výsledok sa spracuje korektne (súhrn samé nuly, prázdne polia).
 *
 * @throws AuthError 401/403 pri chýbajúcej autorizácii.
 */
export async function getEquipmentInventory(): Promise<EquipmentInventoryReport> {
  await authorizeEquipmentInventory();

  const supabase = await createClient();

  // Načítame iba NE-finančné stĺpce potrebné pre tabuľku a súhrn
  // (žiadny purchase_price / purchase_date / hodnota majetku).
  // RLS na `equipment_items` a `equipment_categories` stále platí —
  // bez `inventory.view` používateľ nedostane žiadny riadok.
  const { data, error } = await supabase
    .from("equipment_items")
    .select("id, name, status, location, category:equipment_categories(name)")
    .order("name", { ascending: true });

  if (error) {
    console.error("[getEquipmentInventory] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní prehľadu inventára.");
  }

  const raw =
    (data ?? []) as unknown as {
      id: string;
      name: string;
      status: string;
      location: string | null;
      category: { name: string } | null;
    }[];

  const items: EquipmentInventoryItem[] = raw.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    location: row.location,
    categoryName: row.category?.name ?? null,
  }));

  // Súhrn počíta z rovnakých riadkov (žiadny druhý dotaz, žiadne finančné polia).
  const summary = summarizeEquipment(items as readonly EquipmentSummaryRow[]);

  return { summary, items };
}