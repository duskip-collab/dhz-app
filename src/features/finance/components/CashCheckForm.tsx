"use client";

// =============================================================================
// CashCheckForm — manuálne zadanie skutočného stavu hotovosti (špec. 6).
//
// Zásady:
//   * evidovaný zostatok sa zobrazí, ale NEDÁ sa upraviť (len na čítanie),
//   * rozdiel sa počíta live (computeCashCheckDifference — minor units),
//   * odoslanie: saveCashCheckAction (server) → INSERT záznamu kontroly,
//     evidovaný zostatok sa NIKDY nemení; výsledok upozorní na rozdiel,
//   * pri rozdieli vyzve používateľa na samostatnú opravnú transakciu
//     (žiadne automatické dorovnanie).
// =============================================================================

import { useActionState, useMemo, useState } from "react";
import { ClipboardCheck, Loader2, TriangleAlert } from "lucide-react";
import {
  saveCashCheckAction,
  type AccountBalanceBrief,
  type FinanceActionState,
} from "@/app/(app)/finance/actions";
import {
  CASH_CHECK_REASON_LABELS,
  computeCashCheckDifference,
  formatMinor,
  type CashCheckReason,
} from "@/lib/finance/finance-core";

const REASONS = Object.entries(CASH_CHECK_REASON_LABELS) as [CashCheckReason, string][];

function toMinor(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const eur = Number(normalized);
  if (!Number.isFinite(eur)) return null;
  return Math.round(eur * 100);
}

export function CashCheckForm({ accounts }: { accounts: AccountBalanceBrief[] }) {
  const [state, formAction, pending] = useActionState(
    saveCashCheckAction,
    null as FinanceActionState | null,
  );
  const [selectedAccount, setSelectedAccount] = useState<string>(
    accounts[0]?.accountId ?? "",
  );
  const [actualCash, setActualCash] = useState<string>("");

  const expectedMinor = useMemo(
    () => accounts.find((a) => a.accountId === selectedAccount)?.currentBalanceMinor ?? 0,
    [accounts, selectedAccount],
  );

  const actualMinor = toMinor(actualCash);
  const difference =
    actualMinor !== null ? computeCashCheckDifference(expectedMinor, actualMinor) : null;

  const inputCls =
    "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]";

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Žiadne účty na kontrolu — kontaktujte administrátora.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cc-account" className="block text-sm font-semibold text-gray-700">
            Účet
          </label>
          <select
            id="cc-account"
            name="account_id"
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            required
            className={inputCls}
          >
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.accountName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cc-datetime" className="block text-sm font-semibold text-gray-700">
            Dátum a čas kontroly
          </label>
          <input
            id="cc-datetime"
            name="check_datetime"
            type="datetime-local"
            required
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase text-gray-500">Evidovaný zostatok</p>
          <p className="font-mono text-sm font-bold tabular-nums text-gray-900">
            {formatMinor(expectedMinor)}
          </p>
          <p className="text-[11px] text-gray-400">v čase kontroly (len na čítanie)</p>
        </div>
        <div>
          <label htmlFor="cc-actual" className="block text-sm font-semibold text-gray-700">
            Skutočne spočítaná hotovosť (€)
          </label>
          <input
            id="cc-actual"
            name="actual_cash"
            value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            inputMode="decimal"
            required
            placeholder="napr. 250,00"
            className={inputCls}
          />
          {state && !state.ok && state.errors?.actual_cash ? (
            <p role="alert" className="mt-1 text-xs text-[#C62828]">
              {state.errors.actual_cash}
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
          <p className="text-xs font-semibold uppercase text-gray-500">Rozdiel</p>
          <p
            className={`font-mono text-sm font-bold tabular-nums ${
              difference === null
                ? "text-gray-400"
                : difference === 0
                  ? "text-green-600"
                  : "text-[#C62828]"
            }`}
          >
            {difference === null ? "—" : formatMinor(difference)}
          </p>
          <p className="text-[11px] text-gray-400">skutočný − evidovaný</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cc-reason" className="block text-sm font-semibold text-gray-700">
            Dôvod kontroly
          </label>
          <select
            id="cc-reason"
            name="reason"
            required
            defaultValue="PERIODIC"
            className={inputCls}
          >
            {REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cc-note" className="block text-sm font-semibold text-gray-700">
            Poznámka (nepovinná)
          </label>
          <textarea id="cc-note" name="note" rows={2} className={inputCls} />
        </div>
      </div>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]"
        >
          {state.message}
        </p>
      ) : null}
      {state?.ok && state.warning ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.warning}</span>
        </p>
      ) : null}
      {state?.ok && !state.warning ? (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ClipboardCheck className="h-4 w-4" />
        )}
        {pending ? "Ukladám…" : "Uložiť kontrolu"}
      </button>
      <p className="text-xs text-gray-500">
        Uloženie vytvorí historický záznam kontroly. Evidovaný zostatok sa tým NEMENÍ.
      </p>
    </form>
  );
}
