"use server";

// ============================================================================
// Pokladňa — server actions pre príjmy, výdavky a storno
// ============================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatMinor } from "@/lib/finance/finance-core";
import type { FinanceTransactionInsert } from "@/types/database.types";

export type CashbookActionState =
  | { ok: true; message: string; transactionId?: string }
  | { ok: false; message: string; errors?: Record<string, string> };

function fail(message: string, errors?: Record<string, string>): CashbookActionState {
  return { ok: false, message, errors };
}

function revalidateCashbook(): void {
  revalidatePath("/finance");
  revalidatePath("/finance/cashbook");
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/finance/transactions");
}
// ---------------------------------------------------------------------------
// 1. PRÍJEM — vytvorí INCOME transakciu (POSTED)
// ---------------------------------------------------------------------------

export interface IncomeFormData {
  accountId: string;
  categoryId: string;
  amountMinor: number;
  transactionDate: string;
  description: string;
  counterparty?: string;
  memberId?: string;
  documentNumber?: string;
  note?: string;
  clientToken?: string;
}

export async function createIncomeAction(
  _prev: CashbookActionState | null,
  formData: FormData,
): Promise<CashbookActionState> {
  try {
    await requirePermission(PERMISSIONS.FINANCE_CREATE);

    const accountId = String(formData.get("account_id") ?? "").trim();
    const categoryId = String(formData.get("category_id") ?? "").trim();
    const amountRaw = String(formData.get("amount_minor") ?? "").trim().replace(",", ".");
    const transactionDate = String(formData.get("transaction_date") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const counterparty = String(formData.get("counterparty") ?? "").trim() || null;
    const memberId = String(formData.get("member_id") ?? "").trim() || null;
    const documentNumber = String(formData.get("document_number") ?? "").trim() || null;
    const note = String(formData.get("note") ?? "").trim() || null;
    const clientToken = String(formData.get("client_token") ?? "").trim() || undefined;

    const errors: Record<string, string> = {};
    if (!accountId) errors.account_id = "Vyberte účet.";
    if (!categoryId) errors.category_id = "Vyberte kategóriu.";
    if (!transactionDate) errors.transaction_date = "Zadajte dátum.";
    if (!description) errors.description = "Zadajte popis (za čo).";
    const amountEur = Number(amountRaw);
    if (!amountRaw || !Number.isFinite(amountEur) || amountEur <= 0) {
      errors.amount_minor = "Zadajte kladnú sumu.";
    }
    if (Object.keys(errors).length > 0) return fail("Opravte chybné údaje.", errors);

    const amountMinor = Math.round(amountEur * 100);
    if (amountMinor <= 0) {
      return fail("Suma musí byť kladná.", { amount_minor: "Suma musí byť kladná." });
    }

    const finalDocNumber = documentNumber || (clientToken ? `INCOME-${clientToken}` : undefined);
    if (finalDocNumber) {
      const supabase = await createClient();
      const { data: existing } = await supabase
        .from("finance_transactions")
        .select("id")
        .eq("document_number", finalDocNumber)
        .limit(1);
      if (existing && existing.length > 0) {
        return { ok: true, message: "Príjem bol už zaevidovaný.", transactionId: existing[0].id };
      }
    }

    const insert: FinanceTransactionInsert = {
      account_id: accountId,
      category_id: categoryId,
      type: "INCOME",
      status: "POSTED",
      amount_minor: amountMinor,
      transaction_date: transactionDate,
      document_number: finalDocNumber,
      counterparty,
      description,
      member_id: memberId,
      posted_at: new Date().toISOString(),
      posted_by: undefined,
    } as never;

    const supabase = await createClient();
    const { data: tx, error } = await supabase
      .from("finance_transactions")
      .insert(insert)
      .select("id")
      .single();

    if (error) {
      console.error("[createIncomeAction] insert error:", error);
      if ((error as { statusCode?: number }).statusCode === 403) {
        return fail("Nemáte oprávnenie vytvoriť príjem.");
      }
      return fail("Nepodarilo sa uložiť príjem.");
    }

    revalidateCashbook();
    return {
      ok: true,
      message: `Príjem ${formatMinor(amountMinor)} bol zaevidovaný.`,
      transactionId: (tx as { id: string }).id,
    };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 403) {
      return fail("Nemáte oprávnenie vytvoriť príjem.");
    }
    console.error("[createIncomeAction] error:", e);
    return fail("Chyba pri ukladaní príjmu.");
  }
}
// ---------------------------------------------------------------------------
// 2. VÝDAJ — vytvorí EXPENSE transakciu (POSTED)
// ---------------------------------------------------------------------------

export interface ExpenseFormData {
  accountId: string;
  categoryId: string;
  amountMinor: number;
  transactionDate: string;
  description: string;
  counterparty?: string;
  actionOrPurpose?: string;
  memberId?: string;
  documentNumber?: string;
  note?: string;
  clientToken?: string;
}

export async function createExpenseAction(
  _prev: CashbookActionState | null,
  formData: FormData,
): Promise<CashbookActionState> {
  try {
    await requirePermission(PERMISSIONS.FINANCE_CREATE);

    const accountId = String(formData.get("account_id") ?? "").trim();
    const categoryId = String(formData.get("category_id") ?? "").trim();
    const amountRaw = String(formData.get("amount_minor") ?? "").trim().replace(",", ".");
    const transactionDate = String(formData.get("transaction_date") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const counterparty = String(formData.get("counterparty") ?? "").trim() || null;
    const actionOrPurpose = String(formData.get("action_or_purpose") ?? "").trim() || null;
    const memberId = String(formData.get("member_id") ?? "").trim() || null;
    const documentNumber = String(formData.get("document_number") ?? "").trim() || null;
    const note = String(formData.get("note") ?? "").trim() || null;
    const clientToken = String(formData.get("client_token") ?? "").trim() || undefined;

    const errors: Record<string, string> = {};
    if (!accountId) errors.account_id = "Vyberte účet.";
    if (!categoryId) errors.category_id = "Vyberte kategóriu.";
    if (!transactionDate) errors.transaction_date = "Zadajte dátum.";
    if (!description) errors.description = "Zadajte popis (za čo).";
    const amountEur = Number(amountRaw);
    if (!amountRaw || !Number.isFinite(amountEur) || amountEur <= 0) {
      errors.amount_minor = "Zadajte kladnú sumu.";
    }
    if (Object.keys(errors).length > 0) return fail("Opravte chybné údaje.", errors);

    const amountMinor = Math.round(amountEur * 100);
    if (amountMinor <= 0) {
      return fail("Suma musí byť kladná.", { amount_minor: "Suma musí byť kladná." });
    }

    const finalDocNumber = documentNumber || (clientToken ? `EXPENSE-${clientToken}` : undefined);
    if (finalDocNumber) {
      const supabase = await createClient();
      const { data: existing } = await supabase
        .from("finance_transactions")
        .select("id")
        .eq("document_number", finalDocNumber)
        .limit(1);
      if (existing && existing.length > 0) {
        return { ok: true, message: "Výdaj bol už zaevidovaný.", transactionId: existing[0].id };
      }
    }

    const supabase = await createClient();
    const { data: balRows } = await supabase
      .from("finance_account_balances")
      .select("current_balance_minor")
      .eq("account_id", accountId)
      .limit(1);
    const currentBalance = Number(balRows?.[0]?.current_balance_minor ?? 0);
    if (currentBalance - amountMinor < 0) {
      return fail(
        `Výdaj ${formatMinor(amountMinor)} by spôsobil záporný stav pokladne (${formatMinor(currentBalance - amountMinor)}).`,
        { amount_minor: "Nedostatočný stav pokladne." },
      );
    }

    const insert: FinanceTransactionInsert = {
      account_id: accountId,
      category_id: categoryId,
      type: "EXPENSE",
      status: "POSTED",
      amount_minor: amountMinor,
      transaction_date: transactionDate,
      document_number: finalDocNumber,
      counterparty,
      description,
      member_id: memberId,
      posted_at: new Date().toISOString(),
      posted_by: undefined,
    } as never;

    const { data: tx, error } = await supabase
      .from("finance_transactions")
      .insert(insert)
      .select("id")
      .single();

    if (error) {
      console.error("[createExpenseAction] insert error:", error);
      if ((error as { statusCode?: number }).statusCode === 403) {
        return fail("Nemáte oprávnenie vytvoriť výdaj.");
      }
      return fail("Nepodarilo sa uložiť výdaj.");
    }

    revalidateCashbook();
    return {
      ok: true,
      message: `Výdaj ${formatMinor(amountMinor)} bol zaevidovaný.`,
      transactionId: (tx as { id: string }).id,
    };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 403) {
      return fail("Nemáte oprávnenie vytvoriť výdaj.");
    }
    console.error("[createExpenseAction] error:", e);
    return fail("Chyba pri ukladaní výdaja.");
  }
}

// ---------------------------------------------------------------------------
// 3. STORNO — POSTED → VOID (pouze finance.edit)
// ---------------------------------------------------------------------------

export interface VoidTransactionData {
  transactionId: string;
  voidReason: string;
}

export async function voidTransactionAction(
  _prev: CashbookActionState | null,
  formData: FormData,
): Promise<CashbookActionState> {
  try {
    await requirePermission(PERMISSIONS.FINANCE_EDIT);

    const transactionId = String(formData.get("transaction_id") ?? "").trim();
    const voidReason = String(formData.get("void_reason") ?? "").trim();

    if (!transactionId) return fail("Chýba identifikátor transakcie.", { transaction_id: "Chýba identifikátor." });
    if (!voidReason) return fail("Zadajte dôvod storna.", { void_reason: "Dôvod je povinný." });

    const supabase = await createClient();

    const { data: tx, error: fetchError } = await supabase
      .from("finance_transactions")
      .select("id, status, amount_minor, type, account_id")
      .eq("id", transactionId)
      .maybeSingle();

    if (fetchError || !tx) {
      return fail("Transakcia sa nenašla.");
    }
    if ((tx as { status: string }).status !== "POSTED") {
      return fail("Lze stornovať len zaúčtovanú (POSTED) transakciu.");
    }

    const { error: updateError } = await supabase
      .from("finance_transactions")
      .update({ status: "VOID", void_reason: voidReason })
      .eq("id", transactionId);

    if (updateError) {
      console.error("[voidTransactionAction] update error:", updateError);
      if ((updateError as { statusCode?: number }).statusCode === 403) {
        return fail("Nemáte oprávnenie stornovať transakciu.");
      }
      return fail("Nepodarilo sa stornovať transakciu.");
    }

    revalidateCashbook();
    return { ok: true, message: "Transakcia bola stornovaná (označená ako VOID)." };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 403) {
      return fail("Nemáte oprávnenie stornovať transakciu.");
    }
    console.error("[voidTransactionAction] error:", e);
    return fail("Chyba pri storne transakcie.");
  }
}

// ---------------------------------------------------------------------------
// 4. SÚHRN POKLADNICE
// ---------------------------------------------------------------------------

export interface CashbookSummary {
  accountId: string;
  accountName: string;
  accountType: string;
  openingBalanceMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  closingBalanceMinor: number;
  currentBalanceMinor: number;
  lastCheckDatetime: string | null;
  lastCheckActualMinor: number | null;
  lastCheckDifferenceMinor: number | null;
}

export async function loadCashbookSummary(accountId?: string): Promise<CashbookSummary[]> {
  await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const supabase = await createClient();

  const { data: accounts, error: accError } = await supabase
    .from("finance_accounts")
    .select("id, name, type, opening_balance_minor, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (accError) throw accError;
  if (!accounts || accounts.length === 0) return [];
  const targetIds = accountId ? [accountId] : accounts.map((a) => a.id);

  const { data: balances, error: balError } = await supabase
    .from("finance_account_balances")
    .select("account_id, current_balance_minor")
    .in("account_id", targetIds);

  if (balError) throw balError;
  const balById = new Map((balances ?? []).map((b) => [b.account_id, Number(b.current_balance_minor ?? 0)] as [string, number]));

  const { data: txs, error: txError } = await supabase
    .from("finance_transactions")
    .select("account_id, type, amount_minor, status")
    .in("account_id", targetIds)
    .eq("status", "POSTED");

  if (txError) throw txError;
  const incomeById = new Map<string, number>();
  const expenseById = new Map<string, number>();
  for (const t of (txs ?? [])) {
    const accId = (t as { account_id: string }).account_id;
    const type = (t as { type: string }).type;
    const amount = Number((t as { amount_minor: number }).amount_minor);
    if (type === "INCOME") incomeById.set(accId, (incomeById.get(accId) ?? 0) + amount);
    else if (type === "EXPENSE") expenseById.set(accId, (expenseById.get(accId) ?? 0) + amount);
  }

  const { data: checks, error: chkError } = await supabase
    .from("finance_cash_checks")
    .select("account_id, check_datetime, actual_cash_minor, difference_minor")
    .in("account_id", targetIds)
    .order("check_datetime", { ascending: false });

  if (chkError) throw chkError;
  const lastCheckById = new Map<string, { check_datetime: string; actual_cash_minor: number; difference_minor: number }>();
  for (const c of (checks ?? [])) {
    const accId = (c as { account_id: string }).account_id;
    if (!lastCheckById.has(accId)) {
      lastCheckById.set(accId, {
        check_datetime: (c as { check_datetime: string }).check_datetime,
        actual_cash_minor: Number((c as { actual_cash_minor: number }).actual_cash_minor),
        difference_minor: Number((c as { difference_minor: number }).difference_minor),
      });
    }
  }

  return accounts
    .filter((a) => targetIds.includes(a.id))
    .map((a): CashbookSummary => {
      const opening = Number((a as { opening_balance_minor: number }).opening_balance_minor);
      const income = incomeById.get(a.id) ?? 0;
      const expense = expenseById.get(a.id) ?? 0;
      const current = balById.get(a.id) ?? opening;
      const lastCheck = lastCheckById.get(a.id);
      return {
        accountId: a.id,
        accountName: a.name,
        accountType: a.type,
        openingBalanceMinor: opening,
        incomeMinor: income,
        expenseMinor: expense,
        closingBalanceMinor: opening + income - expense,
        currentBalanceMinor: current,
        lastCheckDatetime: lastCheck?.check_datetime ?? null,
        lastCheckActualMinor: lastCheck?.actual_cash_minor ?? null,
        lastCheckDifferenceMinor: lastCheck?.difference_minor ?? null,
      };
    });
}

// ---------------------------------------------------------------------------
// 5. POLOŽKY POKLADNIČNEJ KNIHY (pre tabuľku s filtrovaním)
// ---------------------------------------------------------------------------

export interface CashbookEntry {
  id: string;
  transactionDate: string;
  type: "INCOME" | "EXPENSE";
  documentNumber: string | null;
  counterparty: string | null;
  description: string | null;
  categoryName: string | null;
  actionOrPurpose: string | null;
  incomeMinor: number;
  expenseMinor: number;
  balanceAfterMinor: number;
  hasAttachment: boolean;
  createdByName: string | null;
  createdAt: string;
  status: "POSTED" | "VOID" | "DRAFT";
  voidReason: string | null;
}

export interface CashbookEntriesResult {
  entries: CashbookEntry[];
  totalIncomeMinor: number;
  totalExpenseMinor: number;
  runningBalanceAtEnd: number;
  truncated: boolean;
}

export async function loadCashbookEntries({
  accountId,
  dateFrom,
  dateTo,
  typeFilter,
  categoryId,
  search,
  limit = 500,
}: {
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  typeFilter?: "INCOME" | "EXPENSE";
  categoryId?: string;
  search?: string;
  limit?: number;
}): Promise<CashbookEntriesResult> {
  await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const supabase = await createClient();

  let query = supabase
    .from("finance_transactions")
    .select(
      "id, account_id, type, status, amount_minor, transaction_date, document_number, counterparty, description, category_id, created_at, void_reason, created_by",
    )
    .in("type", ["INCOME", "EXPENSE"])
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (accountId) query = query.eq("account_id", accountId);
  if (dateFrom) query = query.gte("transaction_date", dateFrom);
  if (dateTo) query = query.lte("transaction_date", dateTo);
  if (typeFilter) query = query.eq("type", typeFilter);
  if (categoryId) query = query.eq("category_id", categoryId);
  if (search) {
    query = query.or(`description.ilike.%${search}%,counterparty.ilike.%${search}%,document_number.ilike.%${search}%`);
  }

  const { data: txs, error } = await query;
  if (error) throw error;

  const allRows = (txs ?? []) as Array<{
    id: string;
    account_id: string;
    type: string;
    status: string;
    amount_minor: number;
    transaction_date: string;
    document_number: string | null;
    counterparty: string | null;
    description: string | null;
    category_id: string | null;
    created_at: string;
    void_reason: string | null;
    created_by: string | null;
  }>;
  const truncated = allRows.length > limit;
  const rows = truncated ? allRows.slice(0, limit) : allRows;

  const catIds = Array.from(new Set(rows.map((r) => r.category_id).filter((id): id is string => !!id)));
  const catById = new Map<string, string>();
  if (catIds.length) {
    const { data: cats } = await supabase.from("finance_categories").select("id, name").in("id", catIds);
    for (const c of (cats ?? [])) {
      catById.set(c.id, c.name);
    }
  }

  const txIds = rows.map((r) => r.id);
  const attachByTx = new Map<string, boolean>();
  if (txIds.length) {
    const { data: atts } = await supabase
      .from("finance_transaction_attachments")
      .select("transaction_id")
      .in("transaction_id", txIds);
    for (const a of (atts ?? [])) {
      attachByTx.set((a as { transaction_id: string }).transaction_id, true);
    }
  }

  const ascRows = [...rows].sort(
    (a, b) =>
      new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime() ||
      a.created_at.localeCompare(b.created_at),
  );

  const accountIds = Array.from(new Set(ascRows.map((r) => r.account_id)));
  const { data: balRows } = await supabase
    .from("finance_account_balances")
    .select("account_id, current_balance_minor")
    .in("account_id", accountIds);
  const balById = new Map(
    (balRows ?? []).map((b) => [b.account_id, Number(b.current_balance_minor ?? 0)] as [string, number]),
  );

  const runningByAccount = new Map<string, number>();
  for (const accId of accountIds) {
    let running = balById.get(accId) ?? 0;
    const accRows = ascRows.filter((r) => r.account_id === accId);
    for (const r of accRows) {
      const amt = Number(r.amount_minor);
      if (r.type === "INCOME") running -= amt;
      else if (r.type === "EXPENSE") running += amt;
    }
    runningByAccount.set(accId, running);
  }

  const entries: CashbookEntry[] = [];
  for (const r of ascRows) {
    const accId = r.account_id;
    let running = runningByAccount.get(accId) ?? 0;
    const amt = Number(r.amount_minor);
    if (r.type === "INCOME") running += amt;
    else if (r.type === "EXPENSE") running -= amt;
    runningByAccount.set(accId, running);

    entries.push({
      id: r.id,
      transactionDate: r.transaction_date,
      type: r.type as "INCOME" | "EXPENSE",
      documentNumber: r.document_number,
      counterparty: r.counterparty,
      description: r.description,
      categoryName: r.category_id ? catById.get(r.category_id) ?? null : null,
      actionOrPurpose: null,
      incomeMinor: r.type === "INCOME" ? amt : 0,
      expenseMinor: r.type === "EXPENSE" ? amt : 0,
      balanceAfterMinor: running,
      hasAttachment: attachByTx.get(r.id) ?? false,
      createdByName: null,
      createdAt: r.created_at,
      status: (r.status as "POSTED" | "VOID" | "DRAFT") ?? "POSTED",
      voidReason: r.void_reason,
    });
  }

  const totalIncome = entries.reduce((s, e) => s + e.incomeMinor, 0);
  const totalExpense = entries.reduce((s, e) => s + e.expenseMinor, 0);
  const runningBalanceAtEnd = entries.length > 0 ? entries[entries.length - 1].balanceAfterMinor : 0;

  return {
    entries,
    totalIncomeMinor: totalIncome,
    totalExpenseMinor: totalExpense,
    runningBalanceAtEnd,
    truncated,
  };
}


