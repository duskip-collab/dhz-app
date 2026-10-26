/**
 * K13.3.1 — UNIT / STATIC testy pre základnú vrstvu reportov.
 *
 * Spúšťané bez bundlera a bez DB cez built-in Node test runner:
 *   node --test src/lib/reports/reports.core.test.ts
 *
 * Overuje čistú (pure) logiku katalógov a gating funkcií:
 *   * AND gating — reports.view samotné NESTAČÍ (požaduje aj perm zdroja),
 *   * katalóg neoznačí „available" report, ktorý nie je implementovaný,
 *   * sumarizácia členov zvláda prázdny výsledok bez chyby.
 *
 * Tieto testy sa týkajú LEN čistých funkcií (bez IO, bez Supabase). Runtimové
 * testy (stránka, RLS, DB) sú samostatne označené v completion reporte.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { PERMISSIONS, type Permission } from "../auth/permissions.ts";
import {
  getReportDefinitions,
  isReportAccessible,
  filterAccessibleReports,
  summarizeMembers,
  summarizeEquipment,
  summarizeVehicles,
  summarizeEvents,
  summarizeFinanceMonthly,
  buildFinanceLedger,
  type ReportDefinition,
  type MemberSummaryRow,
  type EquipmentSummaryRow,
  type VehicleSummaryRow,
  type EventSummaryRow,
  type FinanceSummaryRow,
  type FinanceLedgerSourceRow,
} from "./reports.core.ts";

/** Nájde definíciu podľa id. */
function find(id: string): ReportDefinition {
  const def = getReportDefinitions().find((r) => r.id === id);
  assert.ok(def, `Report "${id}" musí existovať v katalógu.`);
  return def;
}

// ---------------------------------------------------------------------------
// KATALÓG — štruktúra a stavy
// ---------------------------------------------------------------------------

test("katalóg obsahuje unikátne id a len známe oprávnenia", () => {
  const defs = getReportDefinitions();
  assert.ok(defs.length > 0, "Katalóg nesmie byť prázdny.");

  const ids = new Set<string>();
  for (const def of defs) {
    assert.ok(!ids.has(def.id), `Duplikát id: ${def.id}`);
    ids.add(def.id);
    assert.ok(def.requiredPermissions.length > 0, `${def.id} musí mať oprávnenia.`);
    // reports.view musí byť vždy súčasťou požiadaviek.
    assert.ok(
      def.requiredPermissions.includes(PERMISSIONS.REPORTS_VIEW),
      `${def.id} musí vyžadovať reports.view.`,
    );
  }
});

test("reporty dostupné po K13.3.6", () => {
  const available = getReportDefinitions().filter((r) => r.status === "available");
  const ids = available.map((r) => r.id).sort();
  assert.deepEqual(
    ids,
    [
      "events-overview",
      "finance-ledger",
      "finance-monthly-summary",
      "inventory-status",
      "members-overview",
      "vehicle-status",
    ],
    "Presne týchto šesť reportov je dostupných po K13.3.6.",
  );
});

test("finance-monthly-summary vyžaduje reports.view A finance.view (AND), BEZ finance.export, a má route", () => {
  const def = find("finance-monthly-summary");
  assert.deepEqual(
    [...def.requiredPermissions].sort(),
    [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.REPORTS_VIEW].sort(),
  );
  assert.equal(def.route, "/reports/finance-monthly-summary");
  // reports.view samotné NESTAČÍ.
  assert.equal(isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW]), false);
  // finance.view bez reports.view tiež nedá prístup.
  assert.equal(isReportAccessible(def, [PERMISSIONS.FINANCE_VIEW]), false);
  // Obe oprávnenia sprístupnia report — export NIE JE potrebný na zobrazenie.
  assert.equal(
    isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.FINANCE_VIEW]),
    true,
  );
  assert.ok(!def.requiredPermissions.includes(PERMISSIONS.FINANCE_EXPORT));
});

test("inventory-status vyžaduje reports.view A inventory.view (AND) a má route", () => {
  const def = find("inventory-status");
  assert.deepEqual(
    [...def.requiredPermissions].sort(),
    [PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.REPORTS_VIEW].sort(),
  );
  assert.equal(def.route, "/reports/equipment-inventory");
  // reports.view samotné NESTAČÍ.
  assert.equal(isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW]), false);
  // inventory.view bez reports.view tiež nedá prístup.
  assert.equal(isReportAccessible(def, [PERMISSIONS.INVENTORY_VIEW]), false);
  // Obe oprávnenia sprístupnia report.
  assert.equal(
    isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.INVENTORY_VIEW]),
    true,
  );
});

test("vehicle-status vyžaduje reports.view A vehicle.view (AND) a má route", () => {
  const def = find("vehicle-status");
  assert.deepEqual(
    [...def.requiredPermissions].sort(),
    [PERMISSIONS.VEHICLE_VIEW, PERMISSIONS.REPORTS_VIEW].sort(),
  );
  assert.equal(def.route, "/reports/vehicle-status");
  // reports.view samotné NESTAČÍ.
  assert.equal(isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW]), false);
  // vehicle.view bez reports.view tiež nedá prístup.
  assert.equal(isReportAccessible(def, [PERMISSIONS.VEHICLE_VIEW]), false);
  // Obe oprávnenia sprístupnia report.
  assert.equal(
    isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.VEHICLE_VIEW]),
    true,
  );
});

test("events-overview vyžaduje reports.view A calendar.view (AND) a má route", () => {
  const def = find("events-overview");
  assert.deepEqual(
    [...def.requiredPermissions].sort(),
    [PERMISSIONS.CALENDAR_VIEW, PERMISSIONS.REPORTS_VIEW].sort(),
  );
  assert.equal(def.route, "/reports/events-overview");
  // reports.view samotné NESTAČÍ.
  assert.equal(isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW]), false);
  // calendar.view bez reports.view tiež nedá prístup.
  assert.equal(isReportAccessible(def, [PERMISSIONS.CALENDAR_VIEW]), false);
  // Obe oprávnenia sprístupnia report.
  assert.equal(
    isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.CALENDAR_VIEW]),
    true,
  );
});

test("finančné reporty finance-accounts a finance-cashflow sú 'planned'", () => {
  for (const id of ["finance-accounts", "finance-cashflow"]) {
    assert.equal(find(id).status, "planned", `${id} nesmie byť available.`);
  }
});

test("finance-ledger vyžaduje reports.view A finance.view (AND), BEZ finance.export, a má route", () => {
  const def = find("finance-ledger");
  assert.deepEqual(
    [...def.requiredPermissions].sort(),
    [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.REPORTS_VIEW].sort(),
  );
  assert.equal(def.status, "available");
  assert.equal(def.route, "/reports/finance-ledger");
  // reports.view samotné NESTAČÍ.
  assert.equal(isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW]), false);
  // finance.view bez reports.view tiež nedá prístup.
  assert.equal(isReportAccessible(def, [PERMISSIONS.FINANCE_VIEW]), false);
  // Obe oprávnenia sprístupnia report — export NIE JE potrebný.
  assert.equal(
    isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.FINANCE_VIEW]),
    true,
  );
  assert.ok(!def.requiredPermissions.includes(PERMISSIONS.FINANCE_EXPORT));
});

// ---------------------------------------------------------------------------
// GATING — logika AND
// ---------------------------------------------------------------------------

test("AND gating: reports.view samotné NEDOSTAČÍ na dátový report", () => {
  const def = find("members-overview");
  // Len reports.view, bez members.view.
  assert.equal(isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW]), false);
});

test("AND gating: len members.view bez reports.view nedá prístup", () => {
  const def = find("members-overview");
  assert.equal(isReportAccessible(def, [PERMISSIONS.MEMBERS_VIEW]), false);
});

test("AND gating: obe oprávnenia sprístupnia pilotný report", () => {
  const def = find("members-overview");
  assert.equal(
    isReportAccessible(def, [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.MEMBERS_VIEW]),
    true,
  );
});

test("filterAccessibleReports vracia len 'available' reporty prístupné používateľovi", () => {
  // Používateľ s oboma permiami.
  const perms: Permission[] = [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.MEMBERS_VIEW];
  const result = filterAccessibleReports(perms);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "members-overview");

  // Bez perm zdroja -> žiadny dostupný report.
  assert.equal(filterAccessibleReports([PERMISSIONS.REPORTS_VIEW]).length, 0);
});

// ---------------------------------------------------------------------------
// SUMARIZÁCIA — prázdny výsledok a agregácia
// ---------------------------------------------------------------------------

test("sumarizácia prázdneho vstupu nevráti chybu (všetko nula)", () => {
  const summary = summarizeMembers([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.active, 0);
  assert.equal(summary.inactive, 0);
  assert.deepEqual(summary.byMembershipType, {});
});

test("sumarizácia spočíta total, aktívne/neaktívne a typ členstva", () => {
  const rows: MemberSummaryRow[] = [
    { status: "active", membership_type: "adult" },
    { status: "active", membership_type: "adult" },
    { status: "active", membership_type: "youth" },
    { status: "inactive", membership_type: "dorast" },
    { status: null, membership_type: null }, // NULL -> INACTIVE + UNKNOWN
  ];

  const summary = summarizeMembers(rows);
  assert.equal(summary.total, 5);
  assert.equal(summary.active, 3);
  assert.equal(summary.inactive, 2);
  assert.deepEqual(summary.byMembershipType, {
    adult: 2,
    youth: 1,
    dorast: 1,
    UNKNOWN: 1,
  });
});

// ---------------------------------------------------------------------------
// SUMARIZÁCIA INVENTÁRA — prázdny výsledok a agregácia (K13.3.2)
// ---------------------------------------------------------------------------

test("sumarizácia inventára z prázdneho vstupu nevráti chybu (nuly)", () => {
  const summary = summarizeEquipment([]);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.byStatus, {});
});

test("sumarizácia inventára spočíta total a počty podľa stavu", () => {
  const rows: EquipmentSummaryRow[] = [
    { status: "AVAILABLE" },
    { status: "AVAILABLE" },
    { status: "IN_SERVICE" },
    { status: "DAMAGED" },
    { status: null }, // NULL -> UNKNOWN
  ];

  const summary = summarizeEquipment(rows);
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.byStatus, {
    AVAILABLE: 2,
    IN_SERVICE: 1,
    DAMAGED: 1,
    UNKNOWN: 1,
  });
});

// ---------------------------------------------------------------------------
// SUMARIZÁCIA VOZIDIEL — prázdny výsledok a agregácia (K13.3.3)
// ---------------------------------------------------------------------------

test("sumarizácia vozidiel z prázdneho vstupu nevráti chybu (nuly)", () => {
  const summary = summarizeVehicles([], "2026-01-01");
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.byStatus, {});
  assert.equal(summary.stkExpiringSoon, 0);
});

test("sumarizácia vozidiel spočíta total, stavy a STK do 30 dní", () => {
  // Referenčný dátum: 2026-01-01. Horizont STK = 2026-01-31.
  const rows: VehicleSummaryRow[] = [
    { status: "AVAILABLE", stkValidUntil: "2026-01-15" }, // do 30 dní
    { status: "AVAILABLE", stkValidUntil: "2025-12-01" }, // už prekročená -> tiež "soon"
    { status: "IN_SERVICE", stkValidUntil: "2026-06-01" }, // ďaleko -> nie
    { status: "DAMAGED", stkValidUntil: null },            // NULL -> nepočíta sa
    { status: null, stkValidUntil: "2026-01-31" },          // NULL stav -> UNKNOWN; STK na horizonte
  ];

  const summary = summarizeVehicles(rows, "2026-01-01");
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.byStatus, {
    AVAILABLE: 2,
    IN_SERVICE: 1,
    DAMAGED: 1,
    UNKNOWN: 1,
  });
  // 2026-01-15, 2025-12-01 a 2026-01-31 <= 2026-01-31 -> 3.
  assert.equal(summary.stkExpiringSoon, 3);
});

// ---------------------------------------------------------------------------
// SUMARIZÁCIA UDALOSTÍ — prázdny výsledok a agregácia (K13.3.4)
// ---------------------------------------------------------------------------

test("sumarizácia udalostí z prázdneho vstupu nevráti chybu (nuly)", () => {
  const summary = summarizeEvents([]);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.byType, {});
  assert.deepEqual(summary.byStatus, {});
});

test("sumarizácia udalostí spočíta total, typy a stavy", () => {
  const rows: EventSummaryRow[] = [
    { type: "TRAINING", status: "COMPLETED" },
    { type: "TRAINING", status: "PLANNED" },
    { type: "COMPETITION", status: "COMPLETED" },
    { type: "COMPETITION", status: "CANCELLED" },
    { type: "TRAINING", status: null }, // NULL -> UNKNOWN
  ];

  const summary = summarizeEvents(rows);
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.byType, {
    TRAINING: 3,
    COMPETITION: 2,
  });
  assert.deepEqual(summary.byStatus, {
    COMPLETED: 2,
    PLANNED: 1,
    CANCELLED: 1,
    UNKNOWN: 1,
  });
});


// ---------------------------------------------------------------------------
// SUMARIZÁCIA FINANČNEJ BILANCIE — POSTED-only invarianty (K13.3.5)
// ---------------------------------------------------------------------------

test("finančná sumarizácia z prázdneho vstupu nevráti chybu (nuly)", () => {
  const summary = summarizeFinanceMonthly([]);
  assert.deepEqual(summary.months, []);
  assert.deepEqual(summary.totals, {
    incomeMinor: 0,
    expenseMinor: 0,
    netMinor: 0,
    postedCount: 0,
    transferCount: 0,
  });
});

test("finančná bilancia agreguje VÝHRADNE POSTED riadky (DRAFT/VOID ignorované)", () => {
  const rows: FinanceSummaryRow[] = [
    { status: "POSTED", type: "INCOME", transaction_date: "2026-10-05", amount_minor: 10000 },
    { status: "DRAFT", type: "INCOME", transaction_date: "2026-10-06", amount_minor: 9999 },
    { status: "VOID", type: "EXPENSE", transaction_date: "2026-10-07", amount_minor: 8888 },
    { status: null, type: "EXPENSE", transaction_date: "2026-10-08", amount_minor: 7777 },
    { type: "INCOME", transaction_date: "2026-10-09", amount_minor: 6666 }, // bez stavu
  ];

  const summary = summarizeFinanceMonthly(rows);
  assert.equal(summary.months.length, 1);
  assert.equal(summary.months[0].incomeMinor, 10000);
  assert.equal(summary.months[0].expenseMinor, 0);
  assert.equal(summary.months[0].postedCount, 1);
});

test("prevody (TRANSFER_IN/OUT) sú cash-flow neutrálne — nepočítajú sa do príjmov/výdavkov", () => {
  const rows: FinanceSummaryRow[] = [
    { status: "POSTED", type: "TRANSFER_OUT", transaction_date: "2026-10-01", amount_minor: 5000 },
    { status: "POSTED", type: "TRANSFER_IN", transaction_date: "2026-10-01", amount_minor: 5000 },
    { status: "POSTED", type: "INCOME", transaction_date: "2026-10-02", amount_minor: 2000 },
    { status: "POSTED", type: "EXPENSE", transaction_date: "2026-10-03", amount_minor: 700 },
  ];

  const summary = summarizeFinanceMonthly(rows);
  const m = summary.months[0];
  assert.equal(m.incomeMinor, 2000);
  assert.equal(m.expenseMinor, 700);
  assert.equal(m.netMinor, 1300);
  assert.equal(m.transferCount, 2);
  assert.equal(m.postedCount, 4);
});

test("finančná bilancia zoskupí mesiace, spočíta netto a kumulatívne totály", () => {
  const rows: FinanceSummaryRow[] = [
    { status: "POSTED", type: "INCOME", transaction_date: "2026-09-10", amount_minor: 30000 },
    { status: "POSTED", type: "EXPENSE", transaction_date: "2026-09-20", amount_minor: 12500 },
    { status: "POSTED", type: "INCOME", transaction_date: "2026-10-01", amount_minor: 4500 },
    { status: "POSTED", type: "EXPENSE", transaction_date: "2026-10-15", amount_minor: 5500 },
  ];

  const summary = summarizeFinanceMonthly(rows);
  assert.deepEqual(
    summary.months.map((m) => m.month),
    ["2026-09", "2026-10"],
  );
  assert.equal(summary.months[0].netMinor, 17500);
  assert.equal(summary.months[1].netMinor, -1000); // záporné netto
  assert.deepEqual(summary.totals, {
    incomeMinor: 34500,
    expenseMinor: 18000,
    netMinor: 16500,
    postedCount: 4,
    transferCount: 0,
  });
});

test("finančná bilancia ignoruje neplatný dátum a neznámy typ transakcie", () => {
  const rows: FinanceSummaryRow[] = [
    { status: "POSTED", type: "INCOME", transaction_date: "neplatný", amount_minor: 100 },
    { status: "POSTED", type: "INCOME", transaction_date: null, amount_minor: 100 },
    { status: "POSTED", type: "SOMETHING_ELSE", transaction_date: "2026-11-01", amount_minor: 100 },
    { status: "POSTED", type: "EXPENSE", transaction_date: "2026-11-31", amount_minor: 100 }, // deň 31 v 11 → neplatný mesiac? nie — 11 je platný
  ];

  const summary = summarizeFinanceMonthly(rows);
  // Neplatné dátumy vypadnú; neznámy typ sa počíta len do postedCount mesiaca.
  assert.equal(summary.months.length, 1);
  assert.equal(summary.months[0].month, "2026-11");
  assert.equal(summary.months[0].expenseMinor, 100);
  assert.equal(summary.months[0].incomeMinor, 0);
  assert.equal(summary.months[0].postedCount, 2); // SOMETHING_ELSE + EXPENSE
});



// ---------------------------------------------------------------------------
// FINANČNÝ DENNÍK (LEDGER) — POSTED-only invarianty (K13.3.6)
// ---------------------------------------------------------------------------

test("finančný denník z prázdneho vstupu nevráti chybu (nuly)", () => {
  const ledger = buildFinanceLedger([]);
  assert.deepEqual(ledger.entries, []);
  assert.deepEqual(ledger.totals, {
    incomeMinor: 0,
    expenseMinor: 0,
    netMinor: 0,
    postedCount: 0,
    transferCount: 0,
  });
});

test("finančný denník zahrnie VÝHRADNE POSTED riadky (DRAFT/VOID ignorované)", () => {
  const rows: FinanceLedgerSourceRow[] = [
    { id: "p1", status: "POSTED", type: "INCOME", transaction_date: "2026-10-05", amount_minor: 10000 },
    { id: "d1", status: "DRAFT", type: "INCOME", transaction_date: "2026-10-06", amount_minor: 9999 },
    { id: "v1", status: "VOID", type: "EXPENSE", transaction_date: "2026-10-07", amount_minor: 8888 },
    { id: "n1", status: null, type: "EXPENSE", transaction_date: "2026-10-08", amount_minor: 7777 },
  ];

  const ledger = buildFinanceLedger(rows);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].id, "p1");
  assert.equal(ledger.totals.postedCount, 1);
  assert.equal(ledger.totals.incomeMinor, 10000);
});

test("denník: prevody sú cash-flow neutrálne, znamenie signedMinor je korektné", () => {
  const rows: FinanceLedgerSourceRow[] = [
    { id: "t-out", status: "POSTED", type: "TRANSFER_OUT", transaction_date: "2026-10-01", amount_minor: 5000 },
    { id: "t-in", status: "POSTED", type: "TRANSFER_IN", transaction_date: "2026-10-01", amount_minor: 5000 },
    { id: "inc", status: "POSTED", type: "INCOME", transaction_date: "2026-10-02", amount_minor: 2000 },
    { id: "exp", status: "POSTED", type: "EXPENSE", transaction_date: "2026-10-03", amount_minor: 700 },
  ];

  const ledger = buildFinanceLedger(rows);
  assert.equal(ledger.totals.incomeMinor, 2000);
  assert.equal(ledger.totals.expenseMinor, 700);
  assert.equal(ledger.totals.netMinor, 1300);
  assert.equal(ledger.totals.transferCount, 2);
  assert.equal(ledger.totals.postedCount, 4);

  const byId = new Map(ledger.entries.map((e) => [e.id, e]));
  assert.equal(byId.get("inc")?.signedMinor, 2000);
  assert.equal(byId.get("exp")?.signedMinor, -700);
  assert.equal(byId.get("t-out")?.signedMinor, -5000);
  assert.equal(byId.get("t-in")?.signedMinor, 5000);
});

test("denník zoradí položky vzostupne podľa dátumu (potom podľa id)", () => {
  const rows: FinanceLedgerSourceRow[] = [
    { id: "b", status: "POSTED", type: "INCOME", transaction_date: "2026-10-05", amount_minor: 2 },
    { id: "a", status: "POSTED", type: "INCOME", transaction_date: "2026-10-05", amount_minor: 1 },
    { id: "c", status: "POSTED", type: "EXPENSE", transaction_date: "2026-09-30", amount_minor: 3 },
  ];

  const ledger = buildFinanceLedger(rows);
  assert.deepEqual(
    ledger.entries.map((e) => e.id),
    ["c", "a", "b"],
  );
});

test("denník ignoruje neplatný dátum a neznámy typ transakcie", () => {
  const rows: FinanceLedgerSourceRow[] = [
    { id: "x1", status: "POSTED", type: "INCOME", transaction_date: "neplatný", amount_minor: 100 },
    { id: "x2", status: "POSTED", type: "INCOME", transaction_date: null, amount_minor: 100 },
    { id: "x3", status: "POSTED", type: "SOMETHING_ELSE", transaction_date: "2026-11-01", amount_minor: 100 },
    { id: "ok", status: "POSTED", type: "EXPENSE", transaction_date: "2026-11-30", amount_minor: 40 },
  ];

  const ledger = buildFinanceLedger(rows);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].id, "ok");
  assert.equal(ledger.totals.postedCount, 1);
  assert.equal(ledger.totals.expenseMinor, 40);
});

