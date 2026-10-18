"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import type { EquipmentCategory, EquipmentItem } from "@/lib/equipment/equipment.service";

const STATUS_OPTIONS: { value: EquipmentItem["status"]; label: string }[] = [
  { value: "AVAILABLE", label: "K dispozícii" },
  { value: "IN_SERVICE", label: "V servise" },
  { value: "RESERVED", label: "Rezervované" },
  { value: "DAMAGED", label: "Poškodené" },
  { value: "DISPOSED", label: "Vyradené" },
];

const selectCls =
  "min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C62828]";

export function EquipmentFilters({
  categories,
  resultCount,
}: {
  categories: EquipmentCategory[];
  resultCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const search = searchParams.get("q") ?? "";
  const categoryId = searchParams.get("category") ?? "";
  const status = searchParams.get("status") ?? "";
  const expiryOnly = searchParams.get("expiry") === "1";

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setParam("q", e.target.value)}
          placeholder="Hľadať podľa názvu, inventárneho čísla, EČV…"
          aria-label="Vyhľadať majetok"
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[44px]"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="filter-category" className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Kategória
          </label>
          <select
            id="filter-category"
            value={categoryId}
            onChange={(e) => setParam("category", e.target.value)}
            className={selectCls}
          >
            <option value="">Všetky kategórie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-status" className="mb-1 block text-xs font-semibold text-gray-500">
            Stav
          </label>
          <select
            id="filter-status"
            value={status}
            onChange={(e) => setParam("status", e.target.value)}
            className={selectCls}
          >
            <option value="">Všetky stavy</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={expiryOnly}
            onChange={(e) => setParam("expiry", e.target.checked ? "1" : null)}
            className="h-5 w-5 rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]"
          />
          Iba s končiacou STK/revíziou (30 dní)
        </label>
        <p aria-live="polite" className="text-xs text-gray-500">
          Nájdených: <span className="font-semibold tabular-nums">{resultCount}</span>
        </p>
      </div>
    </div>
  );
}
