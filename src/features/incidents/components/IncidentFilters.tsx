"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import type { IncidentType, IncidentStatus } from "@/types/incidents";

const TYPES: { value: IncidentType; label: string }[] = [
  { value: "FIRE", label: "Požiar" },
  { value: "TECHNICAL", label: "Technický zásah" },
  { value: "FLOOD", label: "Povodeň" },
  { value: "TRAFFIC_ACCIDENT", label: "Dopravná nehoda" },
  { value: "TACTICAL_EXERCISE", label: "Taktické cvičenie" },
  { value: "OTHER", label: "Iné" },
];

const STATUSES: { value: IncidentStatus; label: string }[] = [
  { value: "REPORTED", label: "Nahlásený" },
  { value: "IN_PROGRESS", label: "Prebieha" },
  { value: "COMPLETED", label: "Dokončený" },
  { value: "CANCELLED", label: "Zrušený" },
];

const selectCls =
  "min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C62828]";

export function IncidentFilters({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value) params.delete(key);
      else params.set(key, value);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const type = searchParams.get("type") ?? "";
  const status = searchParams.get("status") ?? "";
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="f-type" className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Typ
          </label>
          <select id="f-type" value={type} onChange={(e) => setParam("type", e.target.value)} className={selectCls}>
            <option value="">Všetky typy</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs font-semibold text-gray-500">Stav</label>
          <select id="f-status" value={status} onChange={(e) => setParam("status", e.target.value)} className={selectCls}>
            <option value="">Všetky stavy</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-from" className="mb-1 block text-xs font-semibold text-gray-500">Dátum od</label>
          <input id="f-from" type="date" value={dateFrom} onChange={(e) => setParam("from", e.target.value)} className={selectCls} />
        </div>
        <div>
          <label htmlFor="f-to" className="mb-1 block text-xs font-semibold text-gray-500">Dátum do</label>
          <input id="f-to" type="date" value={dateTo} onChange={(e) => setParam("to", e.target.value)} className={selectCls} />
        </div>
      </div>
      <p aria-live="polite" className="mt-3 text-xs text-gray-500">
        Nájdených: <span className="font-semibold tabular-nums">{resultCount}</span>
      </p>
    </div>
  );
}
