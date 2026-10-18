"use client";

import { Search } from "lucide-react";
import type { MembershipType } from "@/lib/members/members.service";

export type MemberTab = "all" | "adult" | "youth" | "inactive";

export const MEMBER_TAB_FILTERS: Record<
  MemberTab,
  { membershipTypes?: MembershipType[]; status?: "active" | "inactive" }
> = {
  all: { status: "active" },
  adult: { membershipTypes: ["adult"], status: "active" },
  youth: { membershipTypes: ["youth", "preparatory", "dorast"], status: "active" },
  inactive: { status: "inactive" },
};

const TABS: { id: MemberTab; label: string }[] = [
  { id: "all", label: "Všetci" },
  { id: "adult", label: "Dospelí" },
  { id: "youth", label: "Mládež" },
  { id: "inactive", label: "Neaktívni" },
];

export function MemberFilters({
  search,
  onSearchChange,
  tab,
  onTabChange,
  resultCount,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  tab: MemberTab;
  onTabChange: (tab: MemberTab) => void;
  resultCount: number;
}) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Hľadať meno, priezvisko alebo registračné číslo…"
          aria-label="Vyhľadať člena"
          className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-12 pr-4 text-sm outline-none transition placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[48px]"
        />
      </div>
      <div
        role="tablist"
        aria-label="Kategórie členov"
        className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.id)}
              className={`min-h-[44px] flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition ${
                active ? "bg-white text-[#C62828] shadow-sm" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="text-xs text-gray-500">
        Nájdených: <span className="font-semibold tabular-nums">{resultCount}</span>
      </p>
    </div>
  );
}
