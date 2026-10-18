// Finance Ledger Report — Server Service
// K13.3.6 – Detailný finančný denník (`finance-ledger`)
//
// Read-only denník zaúčtovaných transakcií (`finance_transactions`, len
// `status = 'POSTED'`). Agregácia/zoradenie prebieha v čistej unit-testovanej
// funkcii `buildFinanceLedger()` (reports.core.ts).
//
// Finančné invarianty (vynucuje `buildFinanceLedger`, tu dokumentované):
//   * do denníka idú VÝHRADNE riadky so `status === "POSTED"` (DRAFT/VOID
//     sa ignorujú — dvakrát: `.eq("status","POSTED")` v dotaze AJ filter
//     v čistej funkcii; defense-in-depth);
//   * `TRANSFER_IN`/`TRANSFER_OUT` sa NIKDY nepočítajú do príjmov/výdavkov
//     (cash-flow neutralita; evidujú sa len ako `transferCount`);
//   * sumy zostávajú v minor units; EUR je len prezentačná vrstva.
//
// Bezpečnostný model (defense-in-depth):
//   1) `getAuthContext()` overí prihlásenie (neprihlásený → redirect /login),
//   2) explicitná AND kontrola — `reports.view` **A** `finance.view`
//      (BEZ `finance.export`; export je mimo rozsahu),
//   3) každé oprávnenie sa potvrdí aj cez server RPC `has_permission`,
//   4) čítanie cez štandardný serverový Supabase klient (RLS
//      `finance_transactions` aj `finance_categories` = `finance.view`) —
//      NEPOUŽÍVA service-role.
//
// Stránkovanie: horný STROP počtu riadkov (`LEDGER_MAX_ROWS`) + voliteľný
// filter mesiaca — bez serverovej paginácie (mimo rozsahu K13.3.6).

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermissionServer } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { createAuthError } from "@/lib/members/members.errors";
import {
  buildFinanceLedger,
  type FinanceLedgerEntry,
  type FinanceLedgerSourceRow,
  type FinanceTransactionType,
} from "./reports.core";

/** Oprávnenia potrebné na tento report (logika AND; BEZ finance.export). */
const FINANCE_LEDGER_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.FINANCE_VIEW,
];

/** Horný strop počtu načítaných riadkov (bez serverovej paginácie). */
export const LEDGER_MAX_ROWS = 500;

/** Položka denníka obohatená o názov kategórie (pre UI). */
export interface FinanceLedgerDisplayRow extends FinanceLedgerEntry {
  categoryName: string | null;
}

/** Výsledok reportu: položky + totály + kontext filtra. */
export interface FinanceLedgerReport {
  entries: readonly FinanceLedgerDisplayRow[];
  totals: {
    incomeMinor: number;
    expenseMinor: number;
    netMinor: number;
    postedCount: number;
    transferCount: number;
  };
  /** Použitý filter mesiaca (`YYYY-MM`) alebo `null`. */
  month: string | null;
  /** Počet zobrazených riadkov (≤ LEDGER_MAX_ROWS). */
  rowCount: number;
  /** `true`, ak bol strop dosiahnutý a staršie riadky sa nezobrazujú. */
  truncated: boolean;
}

/**
 * Overí, že prihlásený používateľ má VŠETKY oprávnenia reportu (AND).
 * Defense-in-depth: každé oprávnenie sa potvrdí aj cez server RPC.
 */
async function authorizeFinanceLedger(): Promise<void> {
  const ctx = await getAuthContext();

  const missing = FINANCE_LEDGER_PERMISSIONS.filter(
    (permission) => !ctx.permissions.includes(permission),
  );
  if (missing.length > 0) {
    throw createAuthError(403, "Nemáte oprávnenie na tento report.");
  }

  for (const permission of FINANCE_LEDGER_PERMISSIONS) {
    const allowed = await hasPermissionServer(ctx.userId, permission);
    if (!allowed) {
      throw createAuthError(403, "Nemáte oprávnenie na tento report.");
    }
  }
}


/**
 * Vráti detailný finančný denník zaúčtovaných transakcií.
 * Prázdny výsledok sa spracuje korektne (prázdne položky, nulové totály).
 *
 * @param month Voliteľný filter mesiaca `YYYY-MM` (neplatný tvar sa ignoruje).
 * @throws AuthError 401/403 pri chýbajúcej autorizácii, 500 pri chybe čítania.
 */
export async function getFinanceLedger(
  month?: string | null,
): Promise<FinanceLedgerReport> {
  await authorizeFinanceLedger();

  const filterMonth = normalizeMonth(month);
  const supabase = await createClient();

  // Jeden SELECT na transakcie (len stĺpce potrebné pre denník).
  // RLS `finance_transactions` (`finance.view`) stále platí — bez neho
  // používateľ nedostane žiadny riadok. POSTED-filter vynucuje čistá
  // `buildFinanceLedger()` (defense-in-depth).
  let query = supabase
    .from("finance_transactions")
    .select(
      "id, type, status, amount_minor, transaction_date, description, document_number, counterparty, category_id",
    )
    .eq("status", "POSTED")
    .order("transaction_date", { ascending: false })
    .limit(LEDGER_MAX_ROWS + 1); // +1 na detekciu prekročenia stropu

  if (filterMonth !== null) {
    // Mesiac `YYYY-MM` → rozsah [prvý deň, prvý deň nasledujúceho mesiaca).
    const [year, monthNum] = filterMonth.split("-").map(Number);
    const nextMonthFirst =
      monthNum === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(monthNum + 1).padStart(2, "0")}-01`;
    query = query
      .gte("transaction_date", `${filterMonth}-01`)
      .lt("transaction_date", nextMonthFirst);
  }

  const { data: txData, error: txError } = await query;

  if (txError) {
    console.error("[getFinanceLedger] transactions error:", txError);
    throw createAuthError(500, "Chyba pri načítavaní transakcií.");
  }

  // Názvy kategórií (RLS `finance_categories` = `finance.view`).
  const { data: catData, error: catError } = await supabase
    .from("finance_categories")
    .select("id, name");

  if (catError) {
    console.error("[getFinanceLedger] categories error:", catError);
    throw createAuthError(500, "Chyba pri načítavaní kategórií.");
  }

  type TxRow = {
    id: string;
    type: FinanceTransactionType;
    status: string;
    amount_minor: number;
    transaction_date: string;
    description: string | null;
    document_number: string | null;
    counterparty: string | null;
    category_id: string | null;
  };
  const allRows = (txData ?? []) as unknown as TxRow[];
  const truncated = allRows.length > LEDGER_MAX_ROWS;
  const txRows = truncated ? allRows.slice(0, LEDGER_MAX_ROWS) : allRows;

  // Čistá agregácia (POSTED-only, prevody neutrálne, zoradenie vzostupne).
  const ledger = buildFinanceLedger(
    txRows.map(
      (r): FinanceLedgerSourceRow => ({
        id: r.id,
        status: r.status,
        type: r.type,
        transaction_date: r.transaction_date,
        amount_minor: r.amount_minor,
        description: r.description,
        document_number: r.document_number,
        counterparty: r.counterparty,
        category_id: r.category_id,
      }),
    ),
  );

  const catById = new Map<string, string>();
  for (const c of (catData ?? []) as { id: string; name: string }[]) {
    catById.set(c.id, c.name);
  }

  const entries: FinanceLedgerDisplayRow[] = ledger.entries.map((e) => ({
    ...e,
    categoryName:
      e.categoryId !== null ? (catById.get(e.categoryId) ?? null) : null,
  }));

  return {
    entries,
    totals: ledger.totals,
    month: filterMonth,
    rowCount: entries.length,
    truncated,
  };
}

/** Overí tvar filtra mesiaca (`YYYY-MM`); `null` ak nie je zadaný/neplatný. */
function normalizeMonth(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null;
}
