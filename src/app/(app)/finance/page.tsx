import { ClipboardCheck, Coins, Landmark } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getFinanceLedger,
  LEDGER_MAX_ROWS,
  type FinanceLedgerReport,
} from "@/lib/reports/finance-ledger.service";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { loadAccountBalances, type AccountBalanceBrief } from "./actions";
import { CashCheckForm } from "@/features/finance/components/CashCheckForm";
import {
  MembershipDuesSection,
  type DuesRow,
} from "@/features/finance/components/MembershipDuesSection";
import { formatMinor } from "@/lib/finance/finance-core";

const MEMBERSHIP_TYPE_LABELS: Record<string, string> = {
  adult: "Dospelý",
  youth: "Mládež",
  preparatory: "Prípravka",
  dorast: "Dorast",
};

interface CashCheckDisplay {
  id: string;
  accountName: string;
  checkDatetime: string;
  expectedMinor: number;
  actualMinor: number;
  differenceMinor: number;
  reasonLabel: string;
}

const CHECK_REASON_LABELS: Record<string, string> = {
  PERIODIC: "Pravidelná kontrola",
  MONTHLY_CLOSING: "Mesačná uzávierka",
  HANDOVER: "Odovzdanie pokladne",
  DIFFERENCE: "Zistený rozdiel",
  OTHER: "Iná kontrola",
};

/** Predpisy s menami členov (server; pri neaplikovanej migrácii → prázdne pole). */
async function loadMembershipDuesRows(): Promise<DuesRow[]> {
  try {
    const supabase = await createClient();
    const { data: dues, error } = await supabase
      .from("finance_membership_dues")
      .select("id, member_id, year, due_date, amount_due_minor, amount_paid_minor, status")
      .order("year", { ascending: false })
      .limit(1000);
    if (error || !dues || dues.length === 0) return [];

    const dueRows = dues as {
      id: string;
      member_id: string;
      year: number;
      due_date: string;
      amount_due_minor: number;
      amount_paid_minor: number;
      status: DuesRow["status"];
    }[];

    const memberIds = Array.from(new Set(dueRows.map((d) => d.member_id)));
    const { data: members } = await supabase
      .from("members")
      .select("id, first_name, last_name, membership_type")
      .in("id", memberIds);
    const memberRows = (members ?? []) as {
      id: string;
      first_name: string;
      last_name: string;
      membership_type: string | null;
    }[];
    const memberById = new Map(
      memberRows.map((m) => [
        m.id,
        `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Bez mena",
      ]),
    );
    const memberTypeById = new Map(
      memberRows.map((m) => [
        m.id,
        m.membership_type ? (MEMBERSHIP_TYPE_LABELS[m.membership_type] ?? m.membership_type) : "—",
      ]),
    );

    return dueRows.map((d) => ({
      id: d.id,
      memberName: memberById.get(d.member_id) ?? "Bez mena",
      membershipType: memberTypeById.get(d.member_id) ?? "—",
      year: d.year,
      dueDate: d.due_date,
      amountDueMinor: Number(d.amount_due_minor ?? 0),
      amountPaidMinor: Number(d.amount_paid_minor ?? 0),
      status: d.status,
      lastPaymentDate: null,
    }));
  } catch {
    return [];
  }
}

/** História kontrol (posledných 20; bezpečné pri neaplikovanej migrácii). */
async function loadCashCheckHistory(
  accountNames: Map<string, string>,
): Promise<CashCheckDisplay[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("finance_cash_checks")
      .select(
        "id, account_id, check_datetime, expected_balance_minor, actual_cash_minor, difference_minor, reason",
      )
      .order("check_datetime", { ascending: false })
      .limit(20);
    if (error || !data) return [];
    return (
      data as {
        id: string;
        account_id: string;
        check_datetime: string;
        expected_balance_minor: number;
        actual_cash_minor: number;
        difference_minor: number;
        reason: string;
      }[]
    ).map((c) => ({
      id: c.id,
      accountName: accountNames.get(c.account_id) ?? "Účet",
      checkDatetime: c.check_datetime,
      expectedMinor: Number(c.expected_balance_minor ?? 0),
      actualMinor: Number(c.actual_cash_minor ?? 0),
      differenceMinor: Number(c.difference_minor ?? 0),
      reasonLabel: CHECK_REASON_LABELS[c.reason] ?? c.reason,
    }));
  } catch {
    return [];
  }
}

export default async function FinancePage() {
  const ctx = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const canManage = hasPermission(ctx.permissions, PERMISSIONS.FINANCE_CREATE);

  let report: FinanceLedgerReport | null = null;
  try {
    report = await getFinanceLedger(null);
  } catch {
    report = null;
  }

  let balances: AccountBalanceBrief[] = [];
  try {
    balances = await loadAccountBalances();
  } catch {
    balances = [];
  }

  const accountNames = new Map(balances.map((b) => [b.accountId, b.accountName]));
  const dues = await loadMembershipDuesRows();
  const checks = await loadCashCheckHistory(accountNames);
  const currentYear = new Date().getFullYear();
  const totalCash = balances.reduce((s, b) => s + b.currentBalanceMinor, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Landmark className="h-6 w-6 text-[#C62828]" />
        <h1 className="text-2xl font-bold text-gray-900">Financie</h1>
      </div>

      {/* ---- 1/4. FINANČNÝ PREHĽAD (skutočné DB údaje) ---- */}
      {report ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Príjmy</p>
            <p className="text-xl font-bold text-green-600">€{(report.totals.incomeMinor / 100).toFixed(2)}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Výdavky</p>
            <p className="text-xl font-bold text-red-600">€{(report.totals.expenseMinor / 100).toFixed(2)}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Saldo</p>
            <p className="text-xl font-bold text-gray-900">€{(report.totals.netMinor / 100).toFixed(2)}</p>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Finance nie sú dostupné.</p>
      )}

      {/* ---- 2. POKLADŇA / ÚČTY ---- */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Coins className="h-5 w-5 text-[#C62828]" />
          <div>
            <h2 className="text-base font-bold text-gray-900">Pokladňa a bankové účty</h2>
            <p className="text-xs text-gray-500">
              {balances.length === 0
                ? "Žiadne aktívne účty."
                : `Počet účtov: ${balances.length} · Celkový zostatok: ${formatMinor(totalCash)}`}
            </p>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {balances.map((b) => (
            <div key={b.accountId} className="rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-bold text-gray-900">{b.accountName}</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-gray-900">
                {formatMinor(b.currentBalanceMinor)}
              </p>
              <p className="text-[11px] text-gray-400">evidovaný zostatok</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- 6. KONTROLA SKUTOČNÉHO STAVU POKLADNE ---- */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <ClipboardCheck className="h-5 w-5 text-[#C62828]" />
          <div>
            <h2 className="text-base font-bold text-gray-900">Kontrola skutečného stavu pokladne</h2>
            <p className="text-xs text-gray-500">Kontrolu možno zaznamenať kedykoľvek.</p>
          </div>
        </div>
        <div className="space-y-6 p-5">
          {canManage ? (
            <CashCheckForm accounts={balances} />
          ) : (
            <p className="text-sm text-gray-500">Na záznam kontroly potrebujete oprávnenie.</p>
          )}
          {checks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th scope="col" className="px-4 py-3 font-semibold">Dátum</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Účet</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Evidované</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Skutočné</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Rozdiel</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Dôvod</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {checks.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/60 transition">
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(c.checkDatetime).toLocaleString("sk-SK")}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{c.accountName}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-gray-600">
                        {formatMinor(c.expectedMinor)}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-gray-900">
                        {formatMinor(c.actualMinor)}
                      </td>
                      <td
                        className={`px-4 py-3 font-mono tabular-nums font-bold ${
                          c.differenceMinor === 0 ? "text-green-600" : "text-[#C62828]"
                        }`}
                      >
                        {formatMinor(c.differenceMinor)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{c.reasonLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Zatiaľ nebola zaznamenaná žiadna kontrola.</p>
          )}
        </div>
      </section>

      {/* ---- 10/11. ČLENSKÉ PRÍSPEVKY ---- */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">Členské príspevky</h2>
          <p className="text-xs text-gray-500">
            Predpisy podľa aktuálnej evidencie členov · samostatný report.
          </p>
        </div>
        <div className="p-5">
          <MembershipDuesSection
            dues={dues}
            accounts={balances}
            currentYear={currentYear}
            canManage={canManage}
          />
        </div>
      </section>

      <div className="flex gap-4 flex-wrap">
        <Link href="/dashboard/finance">
          <Button variant="secondary" size="sm">Transakcií</Button>
        </Link>
        <Link href="/reports">
          <Button variant="secondary" size="sm">Reporty</Button>
        </Link>
        {canManage && (
          <Link href="/dashboard/finance/transactions">
            <Button variant="primary" size="sm">+ Nová transakcia</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
