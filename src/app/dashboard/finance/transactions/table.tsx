"use client";

import { Badge } from "@/components/ui/Badge";
import type { TxRow, SimpleAccount, SimpleCategory } from "./page";

const TYPE_LABEL: Record<string, string> = {
  INCOME: "Prijem",
  EXPENSE: "Vydavok",
  TRANSFER_IN: "Prevod-in",
  TRANSFER_OUT: "Prevod-out",
};
const STATUS_TONE: Record<string, "gray" | "green" | "red" | "blue" | "yellow"> = {
  DRAFT: "blue",
  POSTED: "green",
  VOID: "red",
};

export function eur(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "—";
  return `€ ${(Math.round(Math.abs(minor) * 100) / 100).toFixed(2)}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("sk-SK");
}

export function TransactionTable({
  rows,
  accounts,
  categories,
}: {
  rows: TxRow[];
  accounts: SimpleAccount[];
  categories: SimpleCategory[];
}) {
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  const catName = (id: string | null) =>
    id ? categories.find((c) => c.id === id)?.name ?? "—" : "—";
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <th scope="col" className="px-4 py-3 font-semibold">Datum</th>
              <th scope="col" className="px-4 py-3 font-semibold">Typ</th>
              <th scope="col" className="px-4 py-3 font-semibold">Kategoria</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Suma</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Ucet</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-gray-50 transition last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-3 tabular-nums text-gray-600">{fmtDate(t.transaction_date)}</td>
                <td className="px-4 py-3"><Badge tone="gray">{TYPE_LABEL[t.type] ?? t.type}</Badge></td>
                <td className="px-4 py-3 text-gray-600">{catName(t.category_id)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">{eur(t.amount_minor)}</td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONE[t.status] ?? "gray"}>{t.status}</Badge></td>
                <td className="px-4 py-3 text-gray-600">{accName(t.account_id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 lg:hidden">
        {rows.map((t) => (
          <li key={t.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono font-semibold tabular-nums text-gray-900">{eur(t.amount_minor)}</p>
                <p className="text-xs text-gray-500">{fmtDate(t.transaction_date)} · {accName(t.account_id)}</p>
              </div>
              <Badge tone={STATUS_TONE[t.status] ?? "gray"}>{t.status}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="gray">{TYPE_LABEL[t.type] ?? t.type}</Badge>
              <span className="text-xs text-gray-500">{catName(t.category_id)}</span>
            </div>
            {t.description && <p className="mt-2 text-sm text-gray-600">{t.description}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
