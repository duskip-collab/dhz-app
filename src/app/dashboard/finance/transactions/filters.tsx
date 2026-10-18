"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const cls =
  "min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-[#C62828]";

export function TransactionFilters({
  accounts,
  accountId,
  status,
  type,
}: {
  accounts: { id: string; name: string }[];
  accountId: string;
  status: string;
  type: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const setParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(sp.toString());
      if (!value) p.delete(key);
      else p.set(key, value);
      router.replace(`${pathname}?${p.toString()}`);
    },
    [router, pathname, sp],
  );
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="f-acct" className="mb-1 block text-xs font-semibold text-gray-500">Ucet</label>
          <select id="f-acct" value={accountId} onChange={(e) => setParam("account_id", e.target.value)} className={cls}>
            <option value="">Vsetky ucty</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs font-semibold text-gray-500">Stav</label>
          <select id="f-status" value={status} onChange={(e) => setParam("status", e.target.value)} className={cls}>
            <option value="">Vsetky stavy</option>
            <option value="DRAFT">DRAFT</option>
            <option value="POSTED">POSTED</option>
            <option value="VOID">VOID</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-type" className="mb-1 block text-xs font-semibold text-gray-500">Typ</label>
          <select id="f-type" value={type} onChange={(e) => setParam("type", e.target.value)} className={cls}>
            <option value="">Vsetky typy</option>
            <option value="INCOME">INCOME</option>
            <option value="EXPENSE">EXPENSE</option>
            <option value="TRANSFER_IN">TRANSFER_IN</option>
            <option value="TRANSFER_OUT">TRANSFER_OUT</option>
          </select>
        </div>
      </div>
      {(accountId || status || type) && (
        <button
          type="button"
          onClick={() => router.replace(pathname)}
          className="mt-3 text-sm font-semibold text-[#C62828] hover:underline"
        >
          Vymazat filtre
        </button>
      )}
    </div>
  );
}
