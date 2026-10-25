// =============================================================================
// finance-core — ČISTÉ funkcie finančného modulu (bez I/O).
//
// Používajú sa server actions / service vrstvou a unit testami (node --test).
// Všetky sumy sú v MINOR UNITS (celé centy) — konzistentne s
// finance_transactions.amount_minor a finance_account_balances.
// Žiadne floating-point sčítavanie peňazí.
// =============================================================================

/** Dôvod pokladničnej kontroly (špec. 6.1) — musí sedieť s DB CHECK. */
export type CashCheckReason =
  | "PERIODIC"
  | "MONTHLY_CLOSING"
  | "HANDOVER"
  | "DIFFERENCE"
  | "OTHER";

export const CASH_CHECK_REASON_LABELS: Record<CashCheckReason, string> = {
  PERIODIC: "Pravidelná kontrola",
  MONTHLY_CLOSING: "Mesačná uzávierka",
  HANDOVER: "Odovzdanie pokladne",
  DIFFERENCE: "Zistený rozdiel",
  OTHER: "Iná kontrola",
};

/** Stav predpisu členského príspevku (špec. 10.3) — musí sedieť s DB CHECK. */
export type DuesStatus = "PENDING" | "PARTIAL" | "PAID" | "WAIVED";

export const DUES_STATUS_LABELS: Record<DuesStatus, string> = {
  PENDING: "Neuhradené",
  PARTIAL: "Čiastočne uhradené",
  PAID: "Uhradené",
  WAIVED: "Oslobodené",
};

/**
 * Rozdiel pokladničnej kontroly = skutočne spočítaná hotovosť − evidovaný
 * zostatok v čase kontroly (minor units). Kladný = prebytok, záporný = manko.
 * Samotný výpočet NIKDY nemení evidovaný zostatok.
 */
export function computeCashCheckDifference(
  expectedBalanceMinor: number,
  actualCashMinor: number,
): number {
  assertMinor(expectedBalanceMinor, "expectedBalanceMinor");
  assertMinor(actualCashMinor, "actualCashMinor");
  return actualCashMinor - expectedBalanceMinor;
}

/**
 * Stav predpisu podľa súm. WAIVED sa touto funkciou NIKDY neurčuje
 * (oslobodenie je manuálne rozhodnutie s dôvodom — špec. 10.3).
 */
export function classifyDuesStatus(
  amountDueMinor: number,
  amountPaidMinor: number,
): Exclude<DuesStatus, "WAIVED"> {
  assertPositiveOrZero(amountDueMinor, "amountDueMinor");
  assertPositiveOrZero(amountPaidMinor, "amountPaidMinor");
  if (amountPaidMinor <= 0) return "PENDING";
  if (amountPaidMinor >= amountDueMinor) return "PAID";
  return "PARTIAL";
}

/** Zostávajúca suma predpisu (minimálne 0 — preplatok nie je záporný dlh). */
export function remainingDuesMinor(
  amountDueMinor: number,
  amountPaidMinor: number,
): number {
  assertPositiveOrZero(amountDueMinor, "amountDueMinor");
  assertPositiveOrZero(amountPaidMinor, "amountPaidMinor");
  return Math.max(0, amountDueMinor - amountPaidMinor);
}

/** Riadok predpisu pre report (špec. 11). */
export interface DuesReportRow {
  amountDueMinor: number;
  amountPaidMinor: number;
  status: DuesStatus;
}

/** Súhrn reportu členských príspevkov (špec. 11.1). */
export interface DuesReportSummary {
  memberCount: number;
  totalDueMinor: number;
  totalPaidMinor: number;
  /**
   * Neuhradená suma = evidencia pohľadávok. NIE je to hotovosť —
   * NESMIE sa pripočítať k stavu pokladne.
   */
  totalUnpaidMinor: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  waivedCount: number;
}

/** Súhrn reportu členských príspevkov z riadkov predpisov. */
export function buildDuesReport(rows: readonly DuesReportRow[]): DuesReportSummary {
  const summary: DuesReportSummary = {
    memberCount: rows.length,
    totalDueMinor: 0,
    totalPaidMinor: 0,
    totalUnpaidMinor: 0,
    paidCount: 0,
    partialCount: 0,
    pendingCount: 0,
    waivedCount: 0,
  };

  for (const row of rows) {
    assertPositiveOrZero(row.amountDueMinor, "amountDueMinor");
    assertPositiveOrZero(row.amountPaidMinor, "amountPaidMinor");
    summary.totalDueMinor += row.amountDueMinor;
    summary.totalPaidMinor += row.amountPaidMinor;
    // Pri WAIVED sa neuhradená suma neberie ako pohľadávka.
    if (row.status !== "WAIVED") {
      summary.totalUnpaidMinor += remainingDuesMinor(
        row.amountDueMinor,
        row.amountPaidMinor,
      );
    }
    switch (row.status) {
      case "PAID":
        summary.paidCount += 1;
        break;
      case "PARTIAL":
        summary.partialCount += 1;
        break;
      case "PENDING":
        summary.pendingCount += 1;
        break;
      case "WAIVED":
        summary.waivedCount += 1;
        break;
    }
  }

  return summary;
}


/** Alokácia platby na jeden predpis (špec. 10.3 — viac predpisov = viac alokácií). */
export interface PaymentAllocation {
  duesId: string;
  amountMinor: number;
}

/**
 * Validácia alokácií úhrady:
 *  - každá alokácia > 0, bez duplicitných predpisov,
 *  - súčet alokácií musí presne zodpovedať sume finančnej transakcie
 *    (jedna platba = jedna transakcia — akceptačné kritérium 12),
 *  - prekročenie zostatku predpisu sa kontroluje na serveri proti DB stavu
 *    (defense-in-depth aj v RLS politike payments_insert).
 * Vracia chybovú správu alebo null.
 */
export function validatePaymentAllocations(
  allocations: readonly PaymentAllocation[],
  transactionAmountMinor: number,
): string | null {
  if (allocations.length === 0) {
    return "Vyberte aspoň jeden predpis na úhradu.";
  }
  if (!Number.isSafeInteger(transactionAmountMinor) || transactionAmountMinor <= 0) {
    return "Suma platby musí byť kladné celé číslo (centy).";
  }
  let sum = 0;
  const seen = new Set<string>();
  for (const a of allocations) {
    if (!Number.isSafeInteger(a.amountMinor) || a.amountMinor <= 0) {
      return "Každá alokácia musí byť kladné celé číslo (centy).";
    }
    if (seen.has(a.duesId)) {
      return "Rovnaký predpis je uvedený viackrát — skombinujte sumu do jednej alokácie.";
    }
    seen.add(a.duesId);
    sum += a.amountMinor;
  }
  if (sum !== transactionAmountMinor) {
    return `Súčet alokácií (${formatMinor(sum)}) nezodpovedá sume platby (${formatMinor(transactionAmountMinor)}).`;
  }
  return null;
}

/**
 * Súhrn uzávierky (špec. 13): očakávaný konečný zostatok
 * = počiatočný + príjmy − výdavky + prevody dnu − prevody von.
 * Prevody sú oddelené — nikdy sa nezapočítajú ako príjem/výdavok.
 */
export function computeExpectedClosingBalance(input: {
  openingBalanceMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  transferInMinor: number;
  transferOutMinor: number;
}): number {
  for (const [key, value] of Object.entries(input)) {
    assertPositiveOrZero(value, key);
  }
  return (
    input.openingBalanceMinor +
    input.incomeMinor -
    input.expenseMinor +
    input.transferInMinor -
    input.transferOutMinor
  );
}

/** Formát minor units na EUR string ("1234" → "12,34 €") — pre zobrazenie. */
export function formatMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}${whole},${cents} €`;
}

// ---------------------------------------------------------------------------
// Interné asercie — chránia pred neplatnými vstupmi (centy = safe integers).
// ---------------------------------------------------------------------------

function assertMinor(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} musí byť celé číslo (minor units / centy).`);
  }
}

function assertPositiveOrZero(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} musí byť nezaporné celé číslo (minor units / centy).`);
  }
}
