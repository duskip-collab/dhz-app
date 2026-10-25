"use client";

// MembershipDuesSection — predpisy, úhrady, report (10/11).
// Dáta zo SERVERA ako props; sumáre: buildDuesReport (pohľadávka ≠ hotovosť).
// Úhrada: payMembershipDueAction → 1 transakcia + allocácia, client_token.

import { useActionState, useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import {
  generateDuesAction,
  payMembershipDueAction,
  type AccountBalanceBrief,
  type FinanceActionState,
} from "@/app/(app)/finance/actions";
import {
  DUES_STATUS_LABELS,
  buildDuesReport,
  formatMinor,
  remainingDuesMinor,
  type DuesStatus,
} from "@/lib/finance/finance-core";

export interface DuesRow {
  id: string;
  memberName: string;
  membershipType: string;
  year: number;
  dueDate: string;
  amountDueMinor: number;
  amountPaidMinor: number;
  status: DuesStatus;
  lastPaymentDate: string | null;
}

const STATUS_STYLES: Record<DuesStatus, string> = {
  PENDING: "bg-red-50 text-[#C62828] border-red-200",
  PARTIAL: "bg-amber-50 text-amber-800 border-amber-200",
  PAID: "bg-green-50 text-green-800 border-green-200",
  WAIVED: "bg-gray-100 text-gray-600 border-gray-200",
};

function StatusBadge({ status }: { status: DuesStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}
    >
      {DUES_STATUS_LABELS[status]}
    </span>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]";


export function MembershipDuesSection({
  dues,
  accounts,
  currentYear,
  canManage,
}: {
  dues: DuesRow[];
  accounts: AccountBalanceBrief[];
  currentYear: number;
  canManage: boolean;
}) {
  const [yearFilter, setYearFilter] = useState<number>(currentYear);
  const [statusFilter, setStatusFilter] = useState<"ALL" | DuesStatus>("ALL");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payState, payAction, payPending] = useActionState(
    payMembershipDueAction,
    null as FinanceActionState | null,
  );
  const [genState, genAction, genPending] = useActionState(
    generateDuesAction,
    null as FinanceActionState | null,
  );

  const filtered = useMemo(
    () =>
      dues.filter(
        (d) =>
          (yearFilter === 0 || d.year === yearFilter) &&
          (statusFilter === "ALL" || d.status === statusFilter),
      ),
    [dues, yearFilter, statusFilter],
  );

  const summary = useMemo(() => buildDuesReport(filtered), [filtered]);
  const years = useMemo(() => {
    const set = new Set<number>(dues.map((d) => d.year));
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [dues, currentYear]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Predpísané</p>
          <p className="font-mono text-lg font-bold tabular-nums text-gray-900">
            {formatMinor(summary.totalDueMinor)}
          </p>
          <p className="text-[11px] text-gray-400">{summary.memberCount} predpisov</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Uhradené</p>
          <p className="font-mono text-lg font-bold tabular-nums text-green-600">
            {formatMinor(summary.totalPaidMinor)}
          </p>
          <p className="text-[11px] text-gray-400">{summary.paidCount} plne uhradených</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Neuhradené</p>
          <p className="font-mono text-lg font-bold tabular-nums text-[#C62828]">
            {formatMinor(summary.totalUnpaidMinor)}
          </p>
          <p className="text-[11px] text-gray-400">pohľadávka — nie hotovosť</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Stavy</p>
          <p className="text-sm font-semibold text-gray-900">
            {summary.paidCount} / {summary.partialCount} / {summary.pendingCount}
          </p>
          <p className="text-[11px] text-gray-400">uhradené / čiastočné / neuhradené</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="dues-year" className="block text-xs font-semibold text-gray-600">
            Obdobie (rok)
          </label>
          <select
            id="dues-year"
            value={yearFilter}
            onChange={(e) => setYearFilter(Number(e.target.value))}
            className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value={0}>Všetky</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dues-status" className="block text-xs font-semibold text-gray-600">
            Stav úhrady
          </label>
          <select
            id="dues-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | DuesStatus)}
            className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="ALL">Všetky</option>
            {(Object.keys(DUES_STATUS_LABELS) as DuesStatus[]).map((s) => (
              <option key={s} value={s}>
                {DUES_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

      {canManage ? (
        <form
          action={genAction}
          className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4"
        >
          <p className="text-sm font-bold text-gray-900">Generovať predpisy</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Idempotentné: existujúce predpisy zostanú nezmenené (member_id + rok).
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="gen-year" className="block text-xs font-semibold text-gray-600">
                Rok
              </label>
              <input
                id="gen-year"
                name="year"
                type="number"
                min={2000}
                max={2100}
                defaultValue={currentYear}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="gen-amount" className="block text-xs font-semibold text-gray-600">
                Výška príspevku (€)
              </label>
              <input
                id="gen-amount"
                name="amount"
                inputMode="decimal"
                required
                placeholder="napr. 20,00"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="gen-due" className="block text-xs font-semibold text-gray-600">
                Dátum splatnosti
              </label>
              <input id="gen-due" name="due_date" type="date" required className={inputCls} />
            </div>
          </div>
          <button
            type="submit"
            disabled={genPending}
            className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white transition hover:bg-[#8E0000] disabled:opacity-50"
          >
            {genPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {genPending ? "Generujem…" : "Vygenerovať predpisy"}
          </button>
          {genState && !genState.ok ? (
            <p role="alert" className="mt-2 text-xs text-[#C62828]">
              {genState.message}
            </p>
          ) : null}
          {genState?.ok ? (
            <p role="status" className="mt-2 text-xs text-green-700">
              {genState.message}
            </p>
          ) : null}
        </form>
      ) : null}

      {payState && !payState.ok ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]"
        >
          {payState.message}
        </p>
      ) : null}
      {payState?.ok ? (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          {payState.message}
        </p>
      ) : null}


      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <th scope="col" className="px-4 py-3 font-semibold">Člen</th>
              <th scope="col" className="px-4 py-3 font-semibold">Obdobie</th>
              <th scope="col" className="px-4 py-3 font-semibold">Predpis</th>
              <th scope="col" className="px-4 py-3 font-semibold">Uhradené</th>
              <th scope="col" className="px-4 py-3 font-semibold">Zostatok</th>
              <th scope="col" className="px-4 py-3 font-semibold">Stav</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Akcie</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((d) => {
              const remaining = remainingDuesMinor(d.amountDueMinor, d.amountPaidMinor);
              const payable = canManage && (d.status === "PENDING" || d.status === "PARTIAL");
              return (
                <tr key={d.id} className="hover:bg-gray-50/60 transition">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{d.memberName}</p>
                    <p className="text-xs text-gray-500">{d.membershipType}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{d.year}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-gray-900">
                    {formatMinor(d.amountDueMinor)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-green-700">
                    {formatMinor(d.amountPaidMinor)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums font-semibold text-[#C62828]">
                    {formatMinor(remaining)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {payable ? (
                      <button
                        type="button"
                        onClick={() => setPayingId(payingId === d.id ? null : d.id)}
                        className="inline-flex min-h-[36px] items-center rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
                      >
                        Uhradiť
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">
            Žiadne predpisy pre zvolené filtre.
          </p>
        ) : null}
      </div>

        <button
          type="button"
          disabled
          title="Export vyžaduje finance.export a ďalšiu fázu"
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-400"
        >
          <FileDown className="h-4 w-4" /> Export
        </button>
      </div>


      {payingId && canManage ? (
        <PaymentPanel
          key={payingId}
          dues={filtered.find((d) => d.id === payingId) ?? null}
          accounts={accounts}
          payAction={payAction}
          payPending={payPending}
        />
      ) : null}
    </div>
  );
}

// Inline panel pre úhradu jedného predpisu (1 transakcia; čiastočná = doplatok neskôr).
function PaymentPanel({
  dues,
  accounts,
  payAction,
  payPending,
}: {
  dues: DuesRow | null;
  accounts: AccountBalanceBrief[];
  payAction: (fd: FormData) => void;
  payPending: boolean;
}) {
  const [formKey] = useState(() => crypto.randomUUID());
  if (!dues || dues.status === "PAID" || dues.status === "WAIVED") return null;
  const remaining = remainingDuesMinor(dues.amountDueMinor, dues.amountPaidMinor);

  return (
    <form action={payAction} className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-4">
      <p className="text-sm font-bold text-gray-900">
        Úhrada — {dues.memberName} ({dues.year})
      </p>
      <p className="mt-0.5 text-xs text-gray-500">
        Zostatok: {formatMinor(remaining)} · Platba vytvorí 1 finančnú transakciu.
      </p>
      <input type="hidden" name="dues_id" value={dues.id} />
      <input type="hidden" name="client_token" value={formKey} />
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="pay-amount" className="block text-xs font-semibold text-gray-600">
            Suma (€)
          </label>
          <input
            id="pay-amount"
            name="amount"
            inputMode="decimal"
            required
            defaultValue={(remaining / 100).toFixed(2)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="pay-account" className="block text-xs font-semibold text-gray-600">
            Účet (kam peniaze prišli)
          </label>
          <select id="pay-account" name="account_id" required className={inputCls}>
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.accountName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pay-date" className="block text-xs font-semibold text-gray-600">
            Dátum platby
          </label>
          <input id="pay-date" name="payment_date" type="date" required className={inputCls} />
        </div>
        <div>
          <label htmlFor="pay-method" className="block text-xs font-semibold text-gray-600">
            Spôsob úhrady
          </label>
          <select id="pay-method" name="method" defaultValue="CASH" className={inputCls}>
            <option value="CASH">Hotovosť</option>
            <option value="BANK_TRANSFER">Bankový prevod</option>
            <option value="CARD">Karta</option>
            <option value="OTHER">Iné</option>
          </select>
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor="pay-note" className="block text-xs font-semibold text-gray-600">
          Poznámka (nepovinná)
        </label>
        <input id="pay-note" name="note" className={inputCls} />
      </div>
      <button
        type="submit"
        disabled={payPending}
        className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white transition hover:bg-[#8E0000] disabled:opacity-50"
      >
        {payPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {payPending ? "Ukladám…" : "Zaznamenať úhradu"}
      </button>
    </form>
  );
}
