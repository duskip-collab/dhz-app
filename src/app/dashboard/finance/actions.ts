"use server";

// Financne server actions pre /dashboard/finance.
// Prijmy/vydavky: insert do `public.finance_transactions`.
// Prevody: RPC `public.finance_create_transfer` (obe nohy atomicky).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatMinor } from "@/lib/finance/finance-core";
import type {
  FinanceTransactionInsert,
  FinanceCategoriesRow,
  FinanceAccountsRow,
} from "@/types/database.types";

// =============================================================================
// Typy pre server action výsledky
// =============================================================================

export type FinanceActionState =
  | { ok: true; message?: string; data?: unknown; transferGroup?: string }
  | {
      ok: false;
      errors: Record<string, string>;
      message: string;
    };

function fail(message: string, errors: Record<string, string> = {}): FinanceActionState {
  return { ok: false, errors, message };
}

function failDb(message: string, details?: unknown): FinanceActionState {
  const d = details && typeof details === "object" ? (details as Record<string, unknown>) : {};
  const hint =
    typeof d.hint === "string" ? ` (${d.hint})` : typeof d.details === "string" ? ` (${d.details})` : "";
  return { ok: false, errors: { base: `${message}${hint}` }, message };
}

function handleError(e: unknown, fallback: string): FinanceActionState {
  // Status 400 = validačná chyba z triggerov/backendu
  const status = (e as { statusCode?: number }).statusCode ?? 500;
  if (status === 400) return failDb(fallback, e);
  if (status === 403) return fail("Nemáte oprávnenie k provedení akcie.");
  if (status === 404) return fail("Záznam sa nenašiel.");
  return failDb(fallback, e);
}

// =============================================================================
// Responzívne celé
// =============================================================================

const REVALIDATE_PATHS = ["/dashboard/finance", "/dashboard/finance/transactions"];

export async function revalidateFinance(): Promise<void> {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

export async function loadFinanceAccounts(): Promise<FinanceAccountsRow[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("finance_accounts")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (res.error) throw res.error;
  return (res.data ?? []) as FinanceAccountsRow[];
}

export async function loadActiveCategories(): Promise<FinanceCategoriesRow[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("finance_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (res.error) throw res.error;
  return (res.data ?? []) as FinanceCategoriesRow[];
}

// =============================================================================
// CREATE – príjmy / výdavky (DRAFT/POSTED)
// =============================================================================

export async function createTransactionAction(
  _prev: FinanceActionState | null,
  data: FinanceTransactionInsert,
): Promise<FinanceActionState> {
  try {
    const supabase = await createClient();
    const res = await supabase
      .from("finance_transactions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(data as any)
      .select()
      .single();

    if (res.error) throw res.error;
    revalidateFinance();
    return { ok: true, data: res.data };
  } catch (e) {
    return handleError(e, "Chyba pri ukladaní transakcie.");
  }
}

// =============================================================================
// CREATE – prevod medzi uctami (RPC public.finance_create_transfer)
// Volané cez useActionState, preto prijima FormData.
// =============================================================================

export async function createTransferAction(
  _prev: FinanceActionState | null,
  formData: FormData,
): Promise<FinanceActionState> {
  try {
    const supabase = await createClient();

    const fromAccountId = String(formData.get("fromAccountId") ?? "").trim();
    const toAccountId = String(formData.get("toAccountId") ?? "").trim();
    const amountRaw = String(formData.get("amountMinor") ?? "").trim().replace(",", ".");
    const transactionDate = String(formData.get("transactionDate") ?? "").trim();
    const documentNumber = String(formData.get("documentNumber") ?? "").trim() || null;
    const description = String(formData.get("description") ?? "").trim() || null;
    const post = String(formData.get("post") ?? "true") === "true";

    if (!fromAccountId || !toAccountId) {
      return fail("Vyberte zdrojový a cieľový účet.");
    }
    if (fromAccountId === toAccountId) {
      return fail("Zdrojový a cieľový účet musia byť rozdielne.");
    }
    const amountEur = Number(amountRaw);
    if (!amountRaw || !Number.isFinite(amountEur) || amountEur <= 0) {
      return fail("Zadajte kladnú sumu.", { amountMinor: "Neplatná suma." });
    }
    const amountMinor = Math.round(amountEur * 100);

    const rpc = (supabase.rpc as any).bind(supabase);
    const { data: groupId, error } = await rpc("finance_create_transfer", {
      p_from_account_id: fromAccountId,
      p_to_account_id: toAccountId,
      p_amount_minor: amountMinor,
      p_transaction_date: transactionDate,
      p_description: description,
      p_document_number: documentNumber,
      p_post: post,
    });

    if (error) throw error;

    revalidateFinance();
    return {
      ok: true,
      message: `Prevod ${formatMinor(amountMinor)} bol vytvorený.`,
      data: groupId ?? null,
      transferGroup: groupId ?? undefined,
    };
  } catch (e) {
    return handleError(e, "Chyba pri vytvarani prevodu.");
  }
}

// =============================================================================
// UPDATE – upraví existujúcu transakciu (iba DRAFT)
// Volané cez useActionState, preto prijima FormData.
// =============================================================================

export async function updateTransactionAction(
  _prev: FinanceActionState | null,
  formData: FormData,
): Promise<FinanceActionState> {
  try {
    const supabase = await createClient();

    const id = String(formData.get("id") ?? "").trim();
    const amountRaw = String(formData.get("amount_minor") ?? "").trim().replace(",", ".");
    const transactionDate = String(formData.get("transaction_date") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const counterparty = String(formData.get("counterparty") ?? "").trim() || null;
    const categoryId = String(formData.get("category_id") ?? "").trim() || null;
    const documentNumber = String(formData.get("document_number") ?? "").trim() || null;

    if (!id) return fail("Transakcia sa nenašla.");

    // Najprv načítaj existujúcu transakciu, aby sme overili status
    const { data: existing, error: fetchError } = await supabase
      .from("finance_transactions")
      .select("id, status, type, account_id, amount_minor")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return fail("Transakcia sa nenašla.");
    }

    const tx = existing as { id: string; status: string; type: string; account_id: string; amount_minor: number };

    // POSTED transakcie nie je možné menit (iba storno). DRAFT je editovatelné.
    if (tx.status !== "DRAFT") {
      return fail("Iba DRAFT transakciu je možné upraviť. Použite storno pre zaúčtované záznamy.");
    }

    const amountEur = Number(amountRaw);
    if (!amountRaw || !Number.isFinite(amountEur) || amountEur <= 0) {
      return fail("Zadajte kladnú sumu.", { amount_minor: "Neplatná suma." });
    }
    const amountMinor = Math.round(amountEur * 100);

    const updatePayload: Record<string, unknown> = {
      amount_minor: amountMinor,
      transaction_date: transactionDate,
      description: description || null,
      counterparty: counterparty,
      category_id: categoryId,
      document_number: documentNumber,
    };

    const { data: updated, error } = await supabase
      .from("finance_transactions")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    revalidateFinance();
    return {
      ok: true,
      message: `Transakcia bola aktualizovaná (${formatMinor(amountMinor)}).`,
      data: updated,
    };
  } catch (e) {
    return handleError(e, "Chyba pri aktualizácii transakcie.");
  }
}

