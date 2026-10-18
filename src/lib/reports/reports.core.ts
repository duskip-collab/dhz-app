// Reports Core — čistá (pure) základná vrstva reportov.
// K13.3.1 – Reports Foundation
//
// Tento modul neobsahuje žiadny serverový kód (žiadny Supabase klient, žiadny
// `@/lib/supabase/*`), aby bol priamo unit-testovateľný bez bundlera a bez DB:
//     node --test src/lib/reports/reports.core.test.ts
//
// Obsahuje:
//   * typovaný katalóg reportov (bez `any`),
//   * bezpečnostné gating funkcie (logika AND, nie OR),
//   * čistú agregáciu prehľadu členov (zvláda prázdny výsledok).

import { PERMISSIONS, type Permission } from "../auth/permissions.ts";

// =============================================================================
// TYPY
// =============================================================================

/** Stav dostupnosti reportu. */
export type ReportStatus = "available" | "planned";

/** Identifikátor zdrojového modulu (nesie report, nie tabuľka). */
export type ReportModule =
  | "members"
  | "training"
  | "competition"
  | "calendar"
  | "inventory"
  | "vehicle"
  | "incidents"
  | "finance";

/**
 * Deklarácia jedného reportu.
 *
 * `requiredPermissions` sa vyhodnocuje logikou **AND** — používateľ musí mať
 * VŠETKY uvedené oprávnenia. `reports.view` samo osebe nikdy neudeľuje prístup
 * k dátam modulu; každý dátový report explicitne uvádza aj oprávnenie zdrojového
 * modulu (napr. `members.view`).
 */
export interface ReportDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly module: ReportModule;
  readonly requiredPermissions: readonly Permission[];
  readonly status: ReportStatus;
  /**
   * Voliteľná cesta na samostatnú stránku reportu. Ak je definovaná, katalóg
   * na `/reports` na ňu odkáže. Reporty bez `route` sa zobrazujú inline.
   */
  readonly route?: string;
}

/** Riadok člena redukovaný na polia potrebné pre agregáciu. */
export interface MemberSummaryRow {
  membership_type?: string | null;
  status?: string | null;
}

/** Výsledok agregácie prehľadu členov. */
export interface MembersOverviewSummary {
  total: number;
  active: number;
  inactive: number;
  byMembershipType: Record<string, number>;
}

// =============================================================================
// KATALÓG REPORTOV
// =============================================================================

/**
 * Katalóg reportov V1.
 *
 * Iba `members-overview` je `available` (má pripravenú serverovú implementáciu
 * a oprávnenia). Ostatné sú `planned` a nesmú byť označené ako dostupné, kým
 * ich serverová vrstva nie je hotová.
 */
export function getReportDefinitions(): readonly ReportDefinition[] {
  return [
    {
      id: "members-overview",
      name: "Prehľad členov",
      description:
        "Počet členov celkovo, rozlíšenie aktívnych/neaktívnych a rozdelenie podľa typu členstva.",
      module: "members",
      requiredPermissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.MEMBERS_VIEW],
      status: "available",
    },
    {
      id: "training-attendance",
      name: "Dochádzka na tréningoch",
      description: "Miera dochádzky členov na tréningoch v zvolenom období.",
      module: "training",
      requiredPermissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.TRAINING_VIEW],
      status: "planned",
    },
    {
      id: "competitions-results",
      name: "Súťaže a výsledky",
      description: "Prehľad súťaží, umiestnení družstiev a bodov.",
      module: "competition",
      requiredPermissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.COMPETITION_VIEW],
      status: "planned",
    },
    {
      id: "events-overview",
      name: "Udalosti, tréningy a akcie",
      description: "Prehľad tréningov a súťaží ako jednotný kalendár udalostí DHZ.",
      module: "calendar",
      requiredPermissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.CALENDAR_VIEW],
      status: "available",
      route: "/reports/events-overview",
    },
    {
      id: "inventory-status",
      name: "Stav inventára",
      description: "Stav položiek inventára podľa kategórií a dostupnosti.",
      module: "inventory",
      requiredPermissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.INVENTORY_VIEW],
      status: "available",
      route: "/reports/equipment-inventory",
    },
    {
      id: "vehicle-status",
      name: "Vozidlá a technika",
      description: "Prehľad vozidiel, ich stavu a platnosti technickej kontroly (STK/EK).",
      module: "vehicle",
      requiredPermissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.VEHICLE_VIEW],
      status: "available",
      route: "/reports/vehicle-status",
    },
    {
      id: "incidents",
      name: "Výjazdová činnosť",
      description: "Prehľad výjazdov podľa typu, stavu a trvania.",
      module: "incidents",
      requiredPermissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.INCIDENTS_VIEW],
      status: "planned",
    },
    {
      id: "finance-monthly-summary",
      name: "Mesačná finančná bilancia",
      description: "Mesačné príjmy, výdavky a netto bilancia (len zaúčtované transakcie).",
      module: "finance",
      requiredPermissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.FINANCE_VIEW],
      status: "available",
      route: "/reports/finance-monthly-summary",
    },
    {
      id: "finance-accounts",
      name: "Finančný prehľad účtov",
      description: "Aktuálne zostatky účtov odvodené z zaúčtovaných transakcií.",
      module: "finance",
      requiredPermissions: [
        PERMISSIONS.REPORTS_VIEW,
        PERMISSIONS.FINANCE_VIEW,
        PERMISSIONS.FINANCE_EXPORT,
      ],
      status: "planned",
    },
    {
      id: "finance-cashflow",
      name: "Príjmy vs výdavky",
      description: "Porovnanie príjmov a výdavkov v zvolenom období (len POSTED).",
      module: "finance",
      requiredPermissions: [
        PERMISSIONS.REPORTS_VIEW,
        PERMISSIONS.FINANCE_VIEW,
        PERMISSIONS.FINANCE_EXPORT,
      ],
      status: "planned",
    },
    {
      id: "finance-ledger",
      name: "Transakčná listina",
      description: "Detail zaúčtovaných transakcií (len POSTED).",
      module: "finance",
      requiredPermissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.FINANCE_VIEW],
      status: "available",
      route: "/reports/finance-ledger",
    },
  ];
}

// =============================================================================
// GATING (logika AND)
// =============================================================================

/**
 * Prístup k reportu = používateľ má VŠETKY požadované oprávnenia (AND).
 * `reports.view` samotné NEDOSTAČUJE — dátový report vyžaduje aj oprávnenie
 * zdrojového modulu.
 */
export function isReportAccessible(
  report: ReportDefinition,
  userPermissions: readonly Permission[],
): boolean {
  return report.requiredPermissions.every((permission) =>
    userPermissions.includes(permission),
  );
}

/**
 * Reporty, ktoré sú zároveň implementované (`available`) A prístupné
 * používateľovi. Plánované reporty tu nikdy nebudú.
 */
export function filterAccessibleReports(
  userPermissions: readonly Permission[],
): readonly ReportDefinition[] {
  return getReportDefinitions().filter(
    (report) => report.status === "available" && isReportAccessible(report, userPermissions),
  );
}

/** Reporty ešte neimplementované (len názov pre informáciu, bez dát). */
export function filterPlannedReports(): readonly ReportDefinition[] {
  return getReportDefinitions().filter((report) => report.status === "planned");
}

// =============================================================================
// ČISTÁ AGREGÁCIA — PREHĽAD ČLENOV
// =============================================================================

/**
 * Agreguje riadky členov do súhrnu. Čistá funkcia (bez IO), zvláda prázdny
 * vstup: vráti samé nuly a prázdne rozdelenie (bez chyby).
 *
 * Definície ukazovateľov:
 *   * total              = počet riadkov,
 *   * active/inactive    = počet podľa status ('ACTIVE' = aktívny; ostatné = neaktívny),
 *   * byMembershipType   = počet podľa membership_type (NULL → 'UNKNOWN').
 */
export function summarizeMembers(
  rows: readonly MemberSummaryRow[],
): MembersOverviewSummary {
  const byMembershipType: Record<string, number> = {};
  let active = 0;
  let inactive = 0;

  for (const row of rows) {
    const membershipType = row.membership_type ?? "UNKNOWN";
    byMembershipType[membershipType] = (byMembershipType[membershipType] ?? 0) + 1;

    if (row.status === "active") {
      active += 1;
    } else {
      inactive += 1;
    }
  }

  return { total: rows.length, active, inactive, byMembershipType };
}

// =============================================================================
// ČISTÁ AGREGÁCIA — STAV INVENTÁRA (K13.3.2)
// =============================================================================

/** Riadok inventára redukovaný na polia potrebné pre agregáciu. */
export interface EquipmentSummaryRow {
  /** Stav položky (equipment_status enum ako text). */
  status?: string | null;
}

/** Výsledok agregácie stavu inventára. */
export interface EquipmentInventorySummary {
  total: number;
  byStatus: Record<string, number>;
}

/**
 * Agreguje riadky inventára do súhrnu. Čistá funkcia (bez IO), zvláda prázdny
 * vstup: vráti samé nuly (bez chyby).
 *
 * Definície ukazovateľov:
 *   * total    = počet položiek inventára (1 riadok = 1 kus; skladom nie je
 *                samostatný stĺpec quantity — viz K13.3.0),
 *   * byStatus = počet podľa `status` (NULL → 'UNKNOWN').
 *
 * Finančné polia (napr. purchase_price) sa NIKDY nečítajú ani neagregujú.
 */
export function summarizeEquipment(
  rows: readonly EquipmentSummaryRow[],
): EquipmentInventorySummary {
  const byStatus: Record<string, number> = {};

  for (const row of rows) {
    const status = row.status ?? "UNKNOWN";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return { total: rows.length, byStatus };
}

// =============================================================================
// ČISTÁ AGREGÁCIA — STAV VOZIDIEL (K13.3.3)
// =============================================================================

/** Riadok vozidla redukovaný na polia potrebné pre agregáciu. */
export interface VehicleSummaryRow {
  /** Stav položky (equipment_status enum ako text) — z `equipment_items`. */
  status?: string | null;
  /** Platnosť STK (ISO dátum `YYYY-MM-DD`) — z `vehicle_details`. */
  stkValidUntil?: string | null;
}

/** Výsledok agregácie stavu vozidiel. */
export interface VehicleStatusSummary {
  total: number;
  byStatus: Record<string, number>;
  /** Počet vozidiel so STK exspirujúcou do 30 dní (vrátane už prekročenej). */
  stkExpiringSoon: number;
}

/** Pridá dni k ISO dátumu (`YYYY-MM-DD`) a vráti ISO dátum. */
function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Agreguje riadky vozidiel do súhrnu. Čistá funkcia (bez IO), zvláda prázdny
 * vstup: vráti samé nuly (bez chyby). Referenčný dátum `todayIso` je
 * voliteľný (default = dnešný deň), aby bola funkcia deterministicky
 * unit-testovateľná.
 *
 * Definície ukazovateľov:
 *   * total           = počet vozidiel (1 riadok = 1 vozidlo),
 *   * byStatus        = počet podľa `status` (NULL → 'UNKNOWN'),
 *   * stkExpiringSoon = počet so `stk_valid_until` ≤ todayIso + 30 dní
 *                       (zahŕňa aj už prekročenú platnosť; NULL sa nepočíta).
 *
 * Finančné polia (purchase_price, náklady na poistku/servis) sa NIKDY nečítajú.
 */
export function summarizeVehicles(
  rows: readonly VehicleSummaryRow[],
  todayIso: string = new Date().toISOString().slice(0, 10),
): VehicleStatusSummary {
  const byStatus: Record<string, number> = {};
  const horizon = addDaysIso(todayIso, 30);
  let stkExpiringSoon = 0;

  for (const row of rows) {
    const status = row.status ?? "UNKNOWN";
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    // ISO dátumy (`YYYY-MM-DD`) sa porovnávajú lexicograficky korektne.
    if (row.stkValidUntil !== null && row.stkValidUntil !== undefined && row.stkValidUntil <= horizon) {
      stkExpiringSoon += 1;
    }
  }

  return { total: rows.length, byStatus, stkExpiringSoon };
}

// =============================================================================
// ČISTÁ AGREGÁCIA — UDALOSTI, TRÉNINGY A AKCIE (K13.3.4)
// =============================================================================

/** Typ udalosti v jednotnom prehľade. */
export type EventType = "TRAINING" | "COMPETITION";

/** Riadok udalosti redukovaný na polia potrebné pre agregáciu. */
export interface EventSummaryRow {
  /** TRAINING (tréning) alebo COMPETITION (súťaž). */
  type: EventType;
  /** Stav (PLANNED / COMPLETED / CANCELLED). */
  status?: string | null;
}

/** Výsledok agregácie udalostí. */
export interface EventsOverviewSummary {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

/**
 * Agreguje riadky udalostí (tréningy + súťaže) do súhrnu. Čistá funkcia
 * (bez IO), zvláda prázdny výsledok: vráti samé nuly (bez chyby).
 *
 * Definície ukazovateľov:
 *   * total    = počet udalostí (1 tréning alebo 1 súťaž = 1 udalosť),
 *   * byType   = počet podľa typu (TRAINING / COMPETITION),
 *   * byStatus = počet podľa stavu (NULL → 'UNKNOWN').
 *
 * Finančné polia (rozpočty akcií, náhrady, odmeny) sa NIKDY nečítajú.
 */
export function summarizeEvents(
  rows: readonly EventSummaryRow[],
): EventsOverviewSummary {
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const row of rows) {
    byType[row.type] = (byType[row.type] ?? 0) + 1;

    const status = row.status ?? "UNKNOWN";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return { total: rows.length, byType, byStatus };
}


// =============================================================================
// ČISTÁ AGREGÁCIA — MESAČNÁ FINANČNÁ BILANCIA (K13.3.5)
// =============================================================================

/** Typ finančnej transakcie (zrkadlí enum schémy `finance_transactions.type`). */
export type FinanceTransactionType =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

/** Riadok transakcie redukovaný na polia potrebné pre mesačnú bilanciu. */
export interface FinanceSummaryRow {
  /** Stav transakcie — agregujú sa LEN riadky so `status === "POSTED"`. */
  status?: string | null;
  type?: FinanceTransactionType | string | null;
  /** Účtovný dátum (`transaction_date`, tvar `YYYY-MM-DD`). */
  transaction_date?: string | null;
  /** Suma v halieroch (minor units, kladné číslo). */
  amount_minor?: number | null;
}

/** Mesačná bilancia (čiastky v halieroch / minor units). */
export interface FinanceMonthlyBalance {
  /** Mesiac ako `YYYY-MM`. */
  month: string;
  /** Súčet INCOME za mesiac (len POSTED). */
  incomeMinor: number;
  /** Súčet EXPENSE za mesiac (len POSTED). */
  expenseMinor: number;
  /** incomeMinor − expenseMinor. */
  netMinor: number;
  /** Počet zaúčtovaných (POSTED) transakcií v mesiaci. */
  postedCount: number;
  /** Počet POSTED transferových riadkov (len evidencia, nie do príjmov/výdavkov). */
  transferCount: number;
}

/** Výsledok mesačnej finančnej bilancie. */
export interface FinanceMonthlySummary {
  /** Mesačné bilancie zoradené vzostupne podľa mesiaca. */
  months: readonly FinanceMonthlyBalance[];
  /** Kumulatívne súčty za celé obdobie (len POSTED). */
  totals: {
    incomeMinor: number;
    expenseMinor: number;
    netMinor: number;
    postedCount: number;
    transferCount: number;
  };
}

/**
 * Izoluje mesiac (`YYYY-MM`) z dátumu (`transaction_date`, tvar `YYYY-MM-DD`).
 * Vráti `null` pri chýbajúcom alebo neplatnom tvare.
 */
function monthKey(transactionDate: string | null | undefined): string | null {
  if (!transactionDate || transactionDate.length < 7) return null;
  const key = transactionDate.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(key)) return null;
  const mm = Number(key.slice(5, 7));
  if (mm < 1 || mm > 12) return null;
  return key;
}

/**
 * Agreguje transakcie do mesačnej bilancie. Čistá funkcia (bez IO), zvláda
 * prázdny vstup: vráti prázdne pole mesiacov a nulové súčty (bez chyby).
 *
 * Finančné invarianty (povinné, unit-testované):
 *   * agregujú sa LEN riadky so `status === "POSTED"` — DRAFT, VOID a riadky
 *     bez stavu sa IGNORUJÚ (nikdy do súčtov);
 *   * `type === "INCOME"` → príjmy; `type === "EXPENSE"` → výdavky;
 *   * `TRANSFER_IN` / `TRANSFER_OUT` sa NIKDY nepočítajú do príjmov ani
 *     výdavkov (cash-flow neutralita; evidujú sa len v `transferCount`);
 *   * neznámy `type` sa ignoruje (ani príjem, ani výdaj);
 *   * všetky čiastky zostávajú v minor units (halieroch); prevod na EUR
 *     je VÝHRADNE prezentačná vrstva;
 *   * neplatné `transaction_date` sa ignoruje.
 */
export function summarizeFinanceMonthly(
  rows: readonly FinanceSummaryRow[],
): FinanceMonthlySummary {
  const byMonth = new Map<string, FinanceMonthlyBalance>();

  const getMonth = (month: string): FinanceMonthlyBalance => {
    let entry = byMonth.get(month);
    if (!entry) {
      entry = {
        month,
        incomeMinor: 0,
        expenseMinor: 0,
        netMinor: 0,
        postedCount: 0,
        transferCount: 0,
      };
      byMonth.set(month, entry);
    }
    return entry;
  };

  for (const row of rows) {
    // Invariant 1 — len POSTED.
    if (row.status !== "POSTED") continue;

    // Invariant 4 — platný mesiac.
    const month = monthKey(row.transaction_date);
    if (month === null) continue;

    const amount =
      typeof row.amount_minor === "number" && Number.isFinite(row.amount_minor)
        ? row.amount_minor
        : 0;

    const entry = getMonth(month);
    entry.postedCount += 1;

    if (row.type === "INCOME") {
      entry.incomeMinor += amount;
    } else if (row.type === "EXPENSE") {
      entry.expenseMinor += amount;
    } else if (row.type === "TRANSFER_IN" || row.type === "TRANSFER_OUT") {
      // Invariant 2 — transfery evidovať, ale NIKDY do príjmov/výdavkov.
      entry.transferCount += 1;
    }
    // Invariant 3 — neznámy typ: ignorovať (len postedCount).
  }

  const months = [...byMonth.values()]
    .map((entry) => ({ ...entry, netMinor: entry.incomeMinor - entry.expenseMinor }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  const totals = months.reduce(
    (acc, m) => ({
      incomeMinor: acc.incomeMinor + m.incomeMinor,
      expenseMinor: acc.expenseMinor + m.expenseMinor,
      netMinor: acc.netMinor + m.netMinor,
      postedCount: acc.postedCount + m.postedCount,
      transferCount: acc.transferCount + m.transferCount,
    }),
    { incomeMinor: 0, expenseMinor: 0, netMinor: 0, postedCount: 0, transferCount: 0 },
  );

  return { months, totals };
}



// ============================================================================
// FINANČNÝ DENNÍK (LEDGER) — K13.3.6
// ============================================================================

/** Riadok transakcie pre denník (redukovaný na polia potrebné pre ledger). */
export interface FinanceLedgerSourceRow {
  /** ID transakcie (PK). */
  id: string;
  /** Stav — do denníka idú VÝHRADNE riadky so `status === "POSTED"`. */
  status?: string | null;
  /** Typ transakcie. */
  type?: FinanceTransactionType | string | null;
  /** Účtovný dátum (`transaction_date`, tvar `YYYY-MM-DD`). */
  transaction_date?: string | null;
  /** Suma v halieroch (kladné číslo; znamenie určuje `type`). */
  amount_minor?: number | null;
  /** Popis (voliteľný). */
  description?: string | null;
  /** Číslo dokladu (voliteľné). */
  document_number?: string | null;
  /** Kontrahent (voliteľný). */
  counterparty?: string | null;
  /** Kategória (voliteľná; transfery majú NULL). */
  category_id?: string | null;
}

/** Položka finančného denníka (zoradená vzostupne podľa dátumu). */
export interface FinanceLedgerEntry {
  id: string;
  transaction_date: string;
  type: FinanceTransactionType;
  /** Suma v halieroch (kladná). */
  amountMinor: number;
  /** Podepsaná suma: INCOME/TRANSFER_IN kladné, EXPENSE/TRANSFER_OUT záporné. */
  signedMinor: number;
  description: string | null;
  documentNumber: string | null;
  counterparty: string | null;
  categoryId: string | null;
}

/** Výsledok finančného denníka: položky + kumulatívne totály (len POSTED). */
export interface FinanceLedgerResult {
  /** Položky zoradené vzostupne podľa `transaction_date`, potom podľa `id`. */
  entries: readonly FinanceLedgerEntry[];
  totals: {
    /** SUM(INCOME) v halieroch — bez prevodov. */
    incomeMinor: number;
    /** SUM(EXPENSE) v halieroch — bez prevodov. */
    expenseMinor: number;
    /** incomeMinor − expenseMinor (prevody sú neutrálne). */
    netMinor: number;
    /** Počet zaúčtovaných (POSTED) riadkov v denníku. */
    postedCount: number;
    /** Počet POSTED prevodových riadkov (evidenčne, nie do príjmov/výdavkov). */
    transferCount: number;
  };
}

/**
 * Zostaví finančný denník z transakcií. Čistá funkcia (bez IO), prázdny vstup
 * = prázdny denník + nulové totály (bez chyby).
 *
 * Finančné invarianty (povinné, unit-testované — zhodné s K13.3.5):
 *   * do denníka idú LEN riadky so `status === "POSTED"` (DRAFT/VOID ignorované);
 *   * `TRANSFER_IN`/`TRANSFER_OUT` sa NIKDY nepočítajú do príjmov ani
 *     výdavkov (cash-flow neutralita; evidujú sa len v `transferCount`);
 *   * znamenie `signedMinor`: INCOME/TRANSFER_IN = +, EXPENSE/TRANSFER_OUT = −;
 *   * neplatný `transaction_date` alebo neznámy `type` → riadok sa preskočí;
 *   * sumy zostávajú v minor units (halieroch).
 */
export function buildFinanceLedger(
  rows: readonly FinanceLedgerSourceRow[],
): FinanceLedgerResult {
  const entries: FinanceLedgerEntry[] = [];
  let incomeMinor = 0;
  let expenseMinor = 0;
  let postedCount = 0;
  let transferCount = 0;

  for (const row of rows) {
    // Invariant 1 — len POSTED.
    if (row.status !== "POSTED") continue;

    // Invariant 4 — platný dátum.
    if (!row.transaction_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.transaction_date)) {
      continue;
    }

    const type = row.type;
    if (
      type !== "INCOME" &&
      type !== "EXPENSE" &&
      type !== "TRANSFER_IN" &&
      type !== "TRANSFER_OUT"
    ) {
      // Invariant 4 — neznámy typ: preskočiť.
      continue;
    }

    const amount =
      typeof row.amount_minor === "number" && Number.isFinite(row.amount_minor)
        ? row.amount_minor
        : 0;

    postedCount += 1;

    let signedMinor: number;
    if (type === "INCOME") {
      incomeMinor += amount;
      signedMinor = amount;
    } else if (type === "EXPENSE") {
      expenseMinor += amount;
      signedMinor = -amount;
    } else {
      // Invariant 2 — prevody: evidovať, ale NIKDY do príjmov/výdavkov.
      transferCount += 1;
      signedMinor = type === "TRANSFER_IN" ? amount : -amount;
    }

    entries.push({
      id: row.id,
      transaction_date: row.transaction_date,
      type,
      amountMinor: amount,
      signedMinor,
      description: row.description ?? null,
      documentNumber: row.document_number ?? null,
      counterparty: row.counterparty ?? null,
      categoryId: row.category_id ?? null,
    });
  }

  entries.sort((a, b) => {
    if (a.transaction_date !== b.transaction_date) {
      return a.transaction_date < b.transaction_date ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return {
    entries,
    totals: {
      incomeMinor,
      expenseMinor,
      netMinor: incomeMinor - expenseMinor,
      postedCount,
      transferCount,
    },
  };
}
