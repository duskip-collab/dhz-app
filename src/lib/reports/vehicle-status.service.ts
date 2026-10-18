// Vehicle Status Report — Server Service
// K13.3.3 – Prevádzkové reporty (Vozidlá a technika)
//
// Serverová implementácia reportu `vehicle-status` (Vozidlá a technika).
//
// Finančné údaje (purchase_price, poistky, servisné náklady, obstarávacie
// ceny) sa tu NIKDY nečítajú — select uvádza výslovne len ne-finančné stĺpce.
// Bezpečnostný model (defense-in-depth):
//   1) `getAuthContext()` overí prihlásenie (neprihlásený → redirect /login),
//   2) explicitná AND kontrola — report vyžaduje `reports.view` **A**
//      `vehicle.view`. `reports.view` samotné NESTAČÍ (pozri katalóg),
//   3) čítanie prebieha cez štandardný serverový Supabase klient (RLS) —
//      NEPOUŽÍVA service-role, neobchádza RLS.
//
// POZNÁMKA k nesúladu oprávnení (K13.3.0, K13.3.2 — neopravované v tejto fáze):
//   RLS politiky `vehicle_details` aj `equipment_items` pre SELECT overujú
//   `inventory.view`, zatiaľ čo aplikácia tu kontroluje `vehicle.view`.
//   Bezpečný dôsledok: používateľ s `vehicle.view`, ale BEZ `inventory.view`,
//   prejde aplikáciou, no RLS mu vráti PRÁZDNY výsledok (fail-closed, žiadny
//   únik dát). Všetky existujúce roly s `vehicle.view` (ADMIN, VEDENIE,
//   VELITEL, CLEN) majú zároveň `inventory.view`, takže v praxi nedochádza
//   k prázdnu. Nesúlad zostáva zapísaný ako otvorená závislosť.

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermissionServer } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { createAuthError } from "@/lib/members/members.errors";
import {
  summarizeVehicles,
  type VehicleSummaryRow,
  type VehicleStatusSummary,
} from "./reports.core";

// Pre-re-export typu pre UI (stránka importuje summary typ odtiaľto).
export type { VehicleStatusSummary } from "./reports.core";

/** Oprávnenia potrebné na tento report (logika AND). */
const VEHICLE_STATUS_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.VEHICLE_VIEW,
];

/** Riadok reportu vozidiel pre UI tabuľku (len ne-finančné polia). */
export interface VehicleStatusItem {
  id: string;
  name: string;
  licensePlate: string | null;
  vin: string | null;
  status: string;
  stkValidUntil: string | null;
  ekValidUntil: string | null;
}

/** Kompletný výsledok reportu: súhrn + riadky pre tabuľku. */
export interface VehicleStatusReport {
  summary: VehicleStatusSummary;
  vehicles: readonly VehicleStatusItem[];
}

/**
 * Overí, že prihlásený používateľ má VŠETKY oprávnenia reportu.
 * Kontrola je AND — chýbajúce hociktoré oprávnenie = zamietnutie.
 * Defense-in-depth: okrem kontextu sa overí aj cez RPC `has_permission`.
 */
async function authorizeVehicleStatus(): Promise<void> {
  const ctx = await getAuthContext();

  const missing = VEHICLE_STATUS_PERMISSIONS.filter(
    (permission) => !ctx.permissions.includes(permission),
  );
  if (missing.length > 0) {
    throw createAuthError(403, "Nemáte oprávnenie na tento report.");
  }

  // Druhá línia obrany — potvrdenie cez server RPC pre obe oprávnenia.
  for (const permission of VEHICLE_STATUS_PERMISSIONS) {
    const allowed = await hasPermissionServer(ctx.userId, permission);
    if (!allowed) {
      throw createAuthError(403, "Nemáte oprávnenie na tento report.");
    }
  }
}

/**
 * Vráti prehľad vozidiel a techniky (súhrn + riadky tabuľky).
 * Prázdny výsledok sa spracuje korektne (súhrn samé nuly, prázdne polia).
 *
 * @throws AuthError 401/403 pri chýbajúcej autorizácii.
 */
export async function getVehicleStatus(): Promise<VehicleStatusReport> {
  await authorizeVehicleStatus();

  const supabase = await createClient();

  // Načítame iba NE-finančné stĺpce potrebné pre tabuľku a súhrn
  // (žiadny purchase_price / poistky / servisné náklady).
  // `equipment_items` sa embeduje ako rodič cez vehicle_details_id_fkey
  // (vehicle_details.id = equipment_items.id) — len pre názov a stav.
  // RLS na `vehicle_details` aj `equipment_items` stále platí.
  const { data, error } = await supabase
    .from("vehicle_details")
    .select(
      "id, license_plate, vin, stk_valid_until, ek_valid_until, " +
        "item:equipment_items(name, status)",
    )
    .order("license_plate", { ascending: true });

  if (error) {
    console.error("[getVehicleStatus] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní prehľadu vozidiel.");
  }

  const raw =
    (data ?? []) as unknown as {
      id: string;
      license_plate: string | null;
      vin: string | null;
      stk_valid_until: string | null;
      ek_valid_until: string | null;
      item: { name: string; status: string } | null;
    }[];

  const vehicles: VehicleStatusItem[] = raw.map((row) => ({
    id: row.id,
    name: row.item?.name ?? "—",
    licensePlate: row.license_plate,
    vin: row.vin,
    status: row.item?.status ?? "UNKNOWN",
    stkValidUntil: row.stk_valid_until,
    ekValidUntil: row.ek_valid_until,
  }));

  // Súhrn počíta z rovnakých riadkov (žiadny druhý dotaz, žiadne finančné polia).
  const summary = summarizeVehicles(
    vehicles.map(
      (v): VehicleSummaryRow => ({
        status: v.status,
        stkValidUntil: v.stkValidUntil,
      }),
    ),
  );

  return { summary, vehicles };
}