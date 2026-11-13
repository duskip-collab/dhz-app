"use server";

// =============================================================================
// Finančné server actions — /finance (kontroly pokladne, členské príspevky).
// Konvencie zhodné s src/app/dashboard/finance/actions.ts.
//
// Bezpečnosť:
//   * každá action overí oprávnenie na serveri (requirePermission),
//   * zápisy idú cez RLS (finance.create / finance.edit),
//   * kontrola pokladne NIKDY nemení evidovaný zostatok — len INSERT záznamu,
//   * úhrada príspevku vytvára PRESNE JEDNU finančnú transakciu (INCOME/POSTED)
//     + allocácie vo finance_membership_payments (sym transaction_id),
//   * idempotencia úhrady: document_number = "DUES-<clientToken>" — opakované
//     odoslanie nevytvorí druhú transakciu.
// =============================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, getAuthContext } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { APP_ROLES } from "@/lib/auth/roles";
import {
  computeCashCheckDifference,
  validatePaymentAllocations,
  type CashCheckReason,
} from "@/lib/finance/finance-core";


export type FinanceActionState =
  | { ok: true; message: string; warning?: string }
  | { ok: false; message: string; errors?: Record<string, string> };

function fail(message: string, errors?: Record<string, string>): FinanceActionState {
  return { ok: false, message, errors };
}

function revalidateFinance(): void {
  revalidatePath("/finance");
}

// =============================================================================
// 6. Evidovaný zostatok pred kontrolou (z view finance_account_balances)
// =============================================================================

export interface AccountBalanceBrief {
  accountId: string;
  accountName: string;
  currentBalanceMinor: number;
}

export async function loadAccountBalances(): Promise<AccountBalanceBrief[]> {
  await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finance_account_balances")
    .select("account_id, account_name, current_balance_minor")
    .order("account_name", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as {
    account_id: string;
    account_name: string;
    current_balance_minor: number | null;
  }[];
  return rows.map((r) => ({
    accountId: r.account_id,
    accountName: r.account_name,
    currentBalanceMinor: Number(r.current_balance_minor ?? 0),
  }));
}

// =============================================================================
// 6. UKÁŽKA SKUTOČNÉHO STAVU POKLADNE — uloženie kontroly
//    Záznam je nemenný (žiadny UPDATE grant); evidovaný zostatok sa NEMENÍ.
// =============================================================================

const CASH_CHECK_REASONS: readonly CashCheckReason[] = [
  "PERIODIC",
  "MONTHLY_CLOSING",
  "HANDOVER",
  "DIFFERENCE",
  "OTHER",
];

export async function saveCashCheckAction(
  _prev: FinanceActionState | null,
  formData: FormData,
): Promise<FinanceActionState> {
  try {
    await requirePermission(PERMISSIONS.FINANCE_CREATE);

    const accountId = String(formData.get("account_id") ?? "");
    const actualRaw = String(formData.get("actual_cash") ?? "").trim().replace(",", ".");
    const reason = String(formData.get("reason") ?? "") as CashCheckReason;
    const note = String(formData.get("note") ?? "").trim() || null;
    const checkDatetime = String(formData.get("check_datetime") ?? "");

    if (!accountId) return fail("Vyberte účet.", { account_id: "Vyberte účet." });
    if (!CASH_CHECK_REASONS.includes(reason)) {
      return fail("Neplatný dôvod kontroly.", { reason: "Vyberte dôvod." });
    }

    const eur = Number(actualRaw);
    if (!actualRaw || !Number.isFinite(eur)) {
      return fail("Zadajte skutočne spočítanú hotovosť.", { actual_cash: "Neplatná suma." });
    }
    const actualMinor = Math.round(eur * 100);
    if (actualMinor < 0) {
      return fail("Skutočný stav nemôže byť záporný.", { actual_cash: "Neplatná suma." });
    }

    const supabase = await createClient();

    // Evidovaný zostatok V ČASE KONTROLY — snapshot z view (opening + POSTED).
    const { data: balRows, error: balError } = await supabase
      .from("finance_account_balances")
      .select("current_balance_minor")
      .eq("account_id", accountId)
      .limit(1);
    if (balError) return fail("Nepodarilo sa načítať evidovaný zostatok.");
    const expectedMinor = Number(balRows?.[0]?.current_balance_minor ?? 0);

    const difference = computeCashCheckDifference(expectedMinor, actualMinor);

    const { error: insertError } = await supabase.from("finance_cash_checks").insert({
      account_id: accountId,
      check_datetime: checkDatetime
        ? new Date(checkDatetime).toISOString()
        : new Date().toISOString(),
      expected_balance_minor: expectedMinor,
      actual_cash_minor: actualMinor,
      reason,
      note,
    } as never);
    if (insertError) {
      console.error("[saveCashCheckAction] insert error:", insertError);
      return fail("Chyba pri ukladaní kontroly.");
    }

    revalidateFinance();

    return {
      ok: true,
      message: "Kontrola pokladne bola uložená.",
      warning:
        difference !== 0
          ? `Rozdiel ${(difference / 100).toFixed(2)} EUR - zostatok sa NEMENÍ.`
          : undefined,
    };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 403) {
      return fail("Nemáte oprávnenie na záznam kontroly pokladne.");
    }
    console.error("[saveCashCheckAction] error:", e);
    return fail("Chyba pri ukladaní kontroly.");
  }
}
// =============================================================================
// 10.1/10.2 GENEROVANIE PREDPISOV — z aktuálneho zoznamu aktívnych členov
//    Idempotentné: UNIQUE(member_id, year) + ON CONFLICT DO NOTHING.
// =============================================================================

export async function generateDuesAction(
  _prev: FinanceActionState | null,
  formData: FormData,
): Promise<FinanceActionState> {
  try {
    await requirePermission(PERMISSIONS.FINANCE_CREATE);

    const year = Number(formData.get("year"));
    const amountEur = Number(String(formData.get("amount") ?? "").trim().replace(",", "."));
    const dueDate = String(formData.get("due_date") ?? "");

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return fail("Zadajte platný rok.", { year: "Neplatný rok." });
    }
    if (!dueDate) {
      return fail("Zadajte dátum splatnosti.", { due_date: "Dátum splatnosti je povinný." });
    }
    if (!Number.isFinite(amountEur) || amountEur <= 0) {
      return fail("Zadajte kladnú výšku príspevku.", { amount: "Neplatná suma." });
    }
    const amountMinor = Math.round(amountEur * 100);
    if (amountMinor <= 0) {
      return fail("Zadajte kladnú výšku príspevku.", { amount: "Neplatná suma." });
    }

    const supabase = await createClient();

    // Aktuálny zoznam členov — ŽIADNA duplikácia osobných údajov (špec. 10).
    const { data: members, error: mErr } = await supabase
      .from("members")
      .select("id")
      .eq("status", "active")
      .order("last_name", { ascending: true });
    if (mErr) {
      console.error("[generateDuesAction] members error:", mErr);
      return fail("Nepodarilo sa načítať zoznam členov.");
    }

    const memberRows = (members ?? []) as { id: string }[];
    if (memberRows.length === 0) {
      return fail("V evidencii nie sú žiadni aktívni členovia.");
    }

    // Idempotentné hromadné vytvorenie: konflikt (member_id, year) preskočíme.
    const insertRows = memberRows.map((m) => ({
      member_id: m.id,
      year,
      due_date: dueDate,
      amount_due_minor: amountMinor,
      status: "PENDING",
    }));

    const { error: insErr } = await supabase
      .from("finance_membership_dues")
      .upsert(insertRows, {
        onConflict: "member_id,year",
        ignoreDuplicates: true,
      });
    if (insErr) {
      console.error("[generateDuesAction] upsert error:", insErr);
      return fail("Nepodarilo sa vytvoriť predpisy.");
    }

    const { count } = await supabase
      .from("finance_membership_dues")
      .select("id", { count: "exact", head: true })
      .eq("year", year);

    revalidateFinance();
    return {
      ok: true,
      message:
        `Predpisy za rok ${year} sú pripravené (spolu ${count ?? 0} záznamov). ` +
        "Už existujúce predpisy zostali nezmenené.",
    };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 403) {
      return fail("Nemáte oprávnenie vytvárať predpisy.");
    }
    console.error("[generateDuesAction] error:", e);
    return fail("Chyba pri vytváraní predpisov.");
  }
}

// =============================================================================
// 10.3 ÚHRADA PREDPISU — JEDNA finančná transakcia + allocácia na predpis
//
// Sekvencia (server-side):
//   1. overenie oprávnení (finance.create AJ finance.edit — POSTED guard),
//   2. validácia alokácií (finance-core) + kontrola zostatku proti DB,
//   3. idempotencia: existujúca transakcia s document_number="DUES-<token>"
//      → vrátime úspech bez nového zápisu,
//   4. INSERT finance_transactions (INCOME, POSTED) — kategória MEMBERSHIP_DUES,
//   5. INSERT finance_membership_payments (allocácia s transaction_id).
//    Agregát amount_paid + status predpisu aktualizuje DB trigger.
// =============================================================================

export async function payMembershipDueAction(
  _prev: FinanceActionState | null,
  formData: FormData,
): Promise<FinanceActionState> {
  try {
    const ctx = await requirePermission(PERMISSIONS.FINANCE_CREATE);
    // POSTED príjem vyžaduje finance.edit (DB guard finance_guard_transactions).
    if (!ctx.permissions.includes(PERMISSIONS.FINANCE_EDIT)) {
      return fail("Na prijatie platby potrebujete oprávnenie finance.edit.");
    }

    const duesId = String(formData.get("dues_id") ?? "");
    const accountId = String(formData.get("account_id") ?? "");
    const amountRaw = String(formData.get("amount") ?? "").trim().replace(",", ".");
    const paymentDate = String(formData.get("payment_date") ?? "");
    const method = String(formData.get("method") ?? "CASH");
    const note = String(formData.get("note") ?? "").trim() || null;
    const clientToken = String(formData.get("client_token") ?? "").trim();

    if (!duesId) return fail("Vyberte predpis.", { dues_id: "Vyberte predpis." });
    if (!accountId) return fail("Vyberte účet.", { account_id: "Vyberte účet." });
    if (!paymentDate) {
      return fail("Zadajte dátum platby.", { payment_date: "Dátum platby je povinný." });
    }
    if (!["CASH", "BANK_TRANSFER", "CARD", "OTHER"].includes(method)) {
      return fail("Neplatný spôsob úhrady.");
    }
    const eur = Number(amountRaw);
    if (!amountRaw || !Number.isFinite(eur) || eur <= 0) {
      return fail("Zadajte kladnú sumu platby.", { amount: "Neplatná suma." });
    }
    const amountMinor = Math.round(eur * 100);
    if (amountMinor <= 0) {
      return fail("Zadajte kladnú sumu platby.", { amount: "Neplatná suma." });
    }

    // Jedna platba na jeden predpis (UI); model podporuje viac alokácií.
    const allocations = [{ duesId, amountMinor }];
    const allocError = validatePaymentAllocations(allocations, amountMinor);
    if (allocError) return fail(allocError);

    const supabase = await createClient();

    // --- Idempotencia: opakované odoslanie s rovnakým client_token ---
    const documentNumber = clientToken ? `DUES-${clientToken}` : null;
    if (documentNumber) {
      const { data: existing } = await supabase
        .from("finance_transactions")
        .select("id")
        .eq("document_number", documentNumber)
        .limit(1);
      if (existing && existing.length > 0) {
        return { ok: true, message: "Platba už bola zaevidovaná." };
      }
    }

    // --- Kontrola zostatku predpisu proti DB (okrem WAIVED) ---
    const { data: dueRow, error: dueErr } = await supabase
      .from("finance_membership_dues")
      .select("id, amount_due_minor, amount_paid_minor, status, year")
      .eq("id", duesId)
      .limit(1)
      .maybeSingle();
    if (dueErr || !dueRow) return fail("Predpis sa nenašiel.");
    const due = dueRow as {
      amount_due_minor: number;
      amount_paid_minor: number;
      status: string;
      year: number;
    };
    if (due.status !== "WAIVED") {
      const remaining = due.amount_due_minor - due.amount_paid_minor;
      if (amountMinor > remaining) {
        return fail(
          `Suma prekračuje zostávajúci dlh (${(remaining / 100).toFixed(2)} €).`,
          { amount: "Suma prekračuje zostatok predpisu." },
        );
      }
    }

    // --- Kategória MEMBERSHIP_DUES (seed z migrácie; fallback = chyba) ---
    const { data: cat } = await supabase
      .from("finance_categories")
      .select("id")
      .eq("code", "MEMBERSHIP_DUES")
      .eq("direction", "INCOME")
      .limit(1)
      .maybeSingle();
    if (!cat) {
      return fail("Kategória „Členské príspevky“ nie je v systéme nastavená.");
    }
    const categoryId = (cat as { id: string }).id;

    // --- JEDNA finančná transakcia (INCOME, POSTED) ---
    const { data: tx, error: txErr } = await supabase
      .from("finance_transactions")
      .insert({
        account_id: accountId,
        category_id: categoryId,
        type: "INCOME",
        status: "POSTED",
        amount_minor: amountMinor,
        transaction_date: paymentDate,
        document_number: documentNumber,
        description: `Úhrada členského príspevku ${due.year}`,
      } as never)
      .select("id")
      .single();
    if (txErr) {
      console.error("[payMembershipDueAction] tx insert error:", txErr);
      return fail("Nepodarilo sa vytvoriť finančnú transakciu.");
    }
    const transactionId = (tx as { id: string }).id;

    // --- Allocácia na predpis (viazaná na transakciu) ---
    const { error: payErr } = await supabase.from("finance_membership_payments").insert({
      dues_id: duesId,
      transaction_id: transactionId,
      account_id: accountId,
      amount_minor: amountMinor,
      payment_date: paymentDate,
      method,
      note,
    } as never);
    if (payErr) {
      console.error("[payMembershipDueAction] payment insert error:", payErr);
      // Konzistencia: ak allocácia zlyhala, odstráni sa aj práve vytvorená
      // transakcia (jednorazový pokus — iná transakcia sa netvorila).
      await supabase.from("finance_transactions").delete().eq("id", transactionId);
      return fail("Nepodarilo sa zaevidovať úhradu na predpise.");
    }

    revalidateFinance();
    return {
      ok: true,
      message: `Platba ${(amountMinor / 100).toFixed(2)} € bola zaevidovaná (1 transakcia).`,
    };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 403) {
      return fail("Nemáte oprávnenie zaevidovať úhradu.");
    }
    console.error("[payMembershipDueAction] error:", e);
    return fail("Chyba pri evidencii úhrady.");
  }
}

// =============================================================================
// ADMIN: Úplné vynulowanie pokladne a reset finančných údajov na nulu
// =============================================================================

export async function resetFinanceDataAction(
  _prev: FinanceActionState | null,
  formData: FormData,
): Promise<FinanceActionState> {
  try {
    const ctx = await getAuthContext();
    const isAdmin = ctx.roles.includes(APP_ROLES.ADMIN) || ctx.role === APP_ROLES.ADMIN;
    if (!isAdmin) {
      return fail("Túto akciu môže vykonať iba administrátor.");
    }

    const confirmText = String(formData.get("confirm_text") ?? "").trim();
    if (confirmText !== "VYNULOVAT") {
      return fail("Pre potvrdenie vynulovania musíte napísať presne text: VYNULOVAT", {
        confirm_text: "Nesprávny potvrdzujúci text.",
      });
    }

    const supabase = await createClient();

    // 1. Zmazanie závislých tabuliek a transakcií (poradie kvôli FK)
    await supabase.from("finance_membership_payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("finance_transaction_attachments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("finance_plans").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("finance_cash_checks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("finance_closings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("finance_transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 2. Reset členských predpisov (neuhradené / nulová úhrada)
    await supabase
      .from("finance_membership_dues")
      .update({ amount_paid_minor: 0, status: "PENDING" } as never)
      .neq("id", "00000000-0000-0000-0000-000000000000");

    // 3. Vynulovanie počiatočných zostatkov všetkých aktívnych účtov na 0
    await supabase
      .from("finance_accounts")
      .update({ opening_balance_minor: 0, opening_balance_date: new Date().toISOString().split("T")[0] } as never)
      .neq("id", "00000000-0000-0000-0000-000000000000");

    // 4. Audit log záznam
    await supabase.from("audit_log").insert({
      user_id: ctx.userId,
      module: "finance",
      action: "finance:reset_all",
      entity_type: "finance_accounts",
      entity_id: null,
      new_data: { reset_at: new Date().toISOString(), reset_by: ctx.email ?? ctx.userId },
    } as never);

    revalidatePath("/finance");
    revalidatePath("/finance/cashbook");
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard/finance/transactions");
    revalidatePath("/reports/finance-ledger");
    revalidatePath("/reports/finance-monthly-summary");

    return {
      ok: true,
      message: "Pokladňa a finančné záznamy boli úspešne vynulované na nulu.",
    };
  } catch (e) {
    console.error("[resetFinanceDataAction] error:", e);
    return fail("Chyba pri vynulovaní finančných údajov.");
  }
}

