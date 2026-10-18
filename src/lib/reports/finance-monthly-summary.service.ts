// Finance Monthly Summary Report — Server Service
// K13.3.5 – Mesačná finančná bilancia (`finance-monthly-summary`)
//
// Prvý finančný report: mesačné príjmy, výdavky a netto bilancia zaúčtovaných
// transakcií (`finance_transactions`). Žiadny pohľad `v_finance_monthly_*`
// v schéme neexistuje — agregácia prebieha v `summarizeFinanceMonthly()`
// (čistá, unit-testovaná) nad riadkami načítanými jedným SELECTom.
//
// Finančné invarianty (vynucuje `summarizeFinanceMonthly`, tu dokumentované):
//   * agregujú sa LEN riadky so `status === "POSTED"` (DRAFT/VOID sa ignorujú);
//   * `TRANSFER_IN` / `TRANSFER_OUT` sa NIKDY nepočítajú do príjmov/výdavkov
//     (cash-flow neutralita; evidujú sa len ako `transferCount`);
//   * čiastky zostávajú v minor units; EUR je len prezentačná vrstva.
//
// Bezpečnostný model (defense-in-depth):
//   1) `getAuthContext()` overí prihlásenie (neprihlásený → redirect /login),
//   2) explicitná AND kontrola — report vyžaduje `reports.view` **A**
//      `finance.view` (bez `finance.export`; export je mimo rozsahu tejto fázy),
//   3) čítanie prebieha cez štandardný serverový Supabase klient (RLS) —
//      NEPOUŽÍVA service-role. RLS `finance_transactions` aj
//      `finance_categories` pre SELECT vyžaduje `finance.view`, takže riadky
//      aj kategórie vidí len držiteľ `finance.view` (AUDIENCIA reports+finc
//      = VEDENIE, POKLADNIK, ADMIN — všetci majú `finance.view`).

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermissionServer } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { createAuthError } from "@/lib/members/members.errors";
import {
  summarizeFinanceMonthly,
  type FinanceMonthlySummary,
  type FinanceSummaryRow,
  type FinanceTransactionType,
} from "./reports.core";

// Pre-re-export typu pre UI (stránka importuje summary typ odtiaľto).
export type { FinanceMonthlySummary } from "./reports.core";

/** Oprávnenia potrebné na tento report (logika AND; BEZ finance.export). */
const FINANCE_MONTHLY_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.FINANCE_VIEW,
];

/** Riadok mesačnej tabuľky pre UI (názov kategórie + bilancia v halieroch). */
export interface FinanceCategoryMonthlyRow {
  categoryId: string | null;
  categoryName: string;
  direction: "INCOME" | "EXPENSE";
  incomeMinor: number;
  expenseMinor: number;
}

/** Kompletný výsledok reportu: mesačná bilancia + kategórie. */
export interface FinanceMonthlySummaryReport {
  summary: FinanceMonthlySummary;
  /** Kategórie so POSTED pohybom, zoradené podľa `sort_order`, potom názvu. */
  categories: readonly FinanceCategoryMonthlyRow[];
}

/**
 * Overí, že prihlásený používateľ má VŠETKY oprávnenia reportu.
 * Kontrola je AND — chýbajúce hociktoré oprávnenie = zamietnutie.
 * Defense-in-depth: okrem kontextu sa overí aj cez RPC `has_permission`.
 */
async function authorizeFinanceMonthly(): Promise<void> {
  const ctx = await getAuthContext();

  const missing = FINANCE_MONTHLY_PERMISSIONS.filter(
    (permission) => !ctx.permissions.includes(permission),
  );
  if (missing.length > 0) {
    throw createAuthError(403, "Nemáte oprávnenie na tento report.");
  }

  // Druhá línia obrany — potvrdenie cez server RPC pre obe oprávnenia.
  for (const permission of FINANCE_MONTHLY_PERMISSIONS) {
    const allowed = await hasPermissionServer(ctx.userId, permission);
    if (!allowed) {
      throw createAuthError(403, "Nemáte oprávnenie na tento report.");
    }
  }
}

/** Izoluje `YYYY-MM` z `YYYY-MM-DD`; `null` pri neplatnom tvare. */
function monthOf(transactionDate: string | null | undefined): string | null {
  if (!transactionDate || transactionDate.length < 7) return null;
  const key = transactionDate.slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(key) ? key : null;
}

/** Kladné číslo alebo 0. */
function toMinor(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Vráti mesačnú bilanciu zaúčtovaných transakcií + analýzu kategórií.
 * Prázdny výsledok sa spracuje korektne (prázdne mesiace, nulové súčty).
 *
 * @throws AuthError 401/403 pri chýbajúcej autorizácii, 500 pri chybe čítania.
 */
export async function getFinanceMonthlySummary(): Promise<FinanceMonthlySummaryReport> {
  await authorizeFinanceMonthly();

  const supabase = await createClient();

  // Jeden SELECT na transakcie (len stĺpce potrebné pre bilanciu).
  // RLS `finance_transactions` (`finance.view`) stále platí — bez neho
  // používateľ nedostane žiadny riadok. POSTED-filter vynucuje čistá
  // `summarizeFinanceMonthly()` (defense-in-depth: aj keby klientský `.eq`
  // zlyhal, DRAFT/VOID sa do súčtov nikdy nedostanú).
  const { data: txData, error: txError } = await supabase
    .from("finance_transactions")
    .select("type, status, amount_minor, transaction_date, category_id")
    .eq("status", "POSTED")
    .order("transaction_date", { ascending: true });

  if (txError) {
    console.error("[getFinanceMonthlySummary] transactions error:", txError);
    throw createAuthError(500, "Chyba pri načítavaní transakcií.");
  }

  // Názvy a smer kategórií (RLS `finance_categories` = `finance.view`).
  const { data: catData, error: catError } = await supabase
    .from("finance_categories")
    .select("id, name, direction, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (catError) {
    console.error("[getFinanceMonthlySummary] categories error:", catError);
    throw createAuthError(500, "Chyba pri načítavaní kategórií.");
  }

  type TxRow = {
    type: FinanceTransactionType;
    status: string;
    amount_minor: number;
    transaction_date: string;
    category_id: string | null;
  };
  const txRows = (txData ?? []) as unknown as TxRow[];

  // Mesačná bilancia = čistá agregácia (POSTED-only, transfery neutrálne).
  const summary = summarizeFinanceMonthly(
    txRows.map(
      (r): FinanceSummaryRow => ({
        status: r.status,
        type: r.type,
        transaction_date: r.transaction_date,
        amount_minor: r.amount_minor,
      }),
    ),
  );

  // Analýza kategórií: LEN POSTED INCOME/EXPENSE (transfery a DRAFT/VOID sa
  // nezapočítavajú; kategória bez pohybu sa nezobrazí). Kategória mimo
  // slovníka (RLS ju skrylo) → riadok „Neznáma kategória".
  const catById = new Map<string, { name: string; direction: string }>();
  for (const c of (catData ?? []) as {
    id: string;
    name: string;
    direction: string;
  }[]) {
    catById.set(c.id, { name: c.name, direction: c.direction });
  }

  const catAgg = new Map<string, { incomeMinor: number; expenseMinor: number }>();
  for (const r of txRows) {
    if (r.status !== "POSTED") continue;
    if (r.type !== "INCOME" && r.type !== "EXPENSE") continue;
    if (monthOf(r.transaction_date) === null) continue;
    const key = r.category_id ?? "__UNKNOWN__";
    const agg = catAgg.get(key) ?? { incomeMinor: 0, expenseMinor: 0 };
    if (r.type === "INCOME") agg.incomeMinor += toMinor(r.amount_minor);
    else agg.expenseMinor += toMinor(r.amount_minor);
    catAgg.set(key, agg);
  }

  const categories: FinanceCategoryMonthlyRow[] = [...catAgg.entries()].map(
    ([key, agg]) => {
      const meta = key === "__UNKNOWN__" ? null : catById.get(key);
      const direction: "INCOME" | "EXPENSE" =
        meta?.direction === "EXPENSE" ? "EXPENSE" : "INCOME";
      return {
        categoryId: key === "__UNKNOWN__" ? null : key,
        categoryName: meta?.name ?? "Neznáma kategória",
        direction,
        incomeMinor: agg.incomeMinor,
        expenseMinor: agg.expenseMinor,
      };
    },
  );

  // Zoradenie kópiou slovníkového poradia (sort_order z dotazu), potom názvu.
  const orderIndex = new Map<string, number>();
  (catData ?? []).forEach((c: { id: string }, i: number) =>
    orderIndex.set(c.id, i),
  );
  const orderOf = (categoryId: string | null): number =>
    categoryId === null
      ? Number.MAX_SAFE_INTEGER
      : (orderIndex.get(categoryId) ?? Number.MAX_SAFE_INTEGER);
  categories.sort((a, b) => {
    const oa = orderOf(a.categoryId);
    const ob = orderOf(b.categoryId);
    if (oa !== ob) return oa - ob;
    return a.categoryName.localeCompare(b.categoryName);
  });

  return { summary, categories };
}

