"use client";

import type { CompetitionCategory } from "@/lib/competitions/competition.service";

export type CategoryTab = "ALL" | "MEN" | "WOMEN" | "DORAST" | "PLAMEN" | "MIX";
export type StatusTab = "PLANNED" | "COMPLETED" | "CANCELLED" | "ALL";

// Každá záložka kategórie mapuje na množinu hodnôt CompetitionCategory.
const CATEGORY_TABS: { id: CategoryTab; label: string; values: CompetitionCategory[] | null }[] = [
  { id: "ALL", label: "Všetky", values: null },
  { id: "MEN", label: "Muži", values: ["MEN"] },
  { id: "WOMEN", label: "Ženy", values: ["WOMEN"] },
  { id: "DORAST", label: "Dorast", values: ["DORAST_BOYS", "DORAST_GIRLS"] },
  { id: "PLAMEN", label: "Plameň", values: ["PLAMEN_BOYS", "PLAMEN_GIRLS"] },
  { id: "MIX", label: "Mix", values: ["MIX"] },
];

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: "PLANNED", label: "Plánované" },
  { id: "COMPLETED", label: "Dokončené" },
  { id: "CANCELLED", label: "Zrušené" },
  { id: "ALL", label: "Všetky" },
];

export function categoryMatches(tab: CategoryTab, category: CompetitionCategory): boolean {
  const entry = CATEGORY_TABS.find((t) => t.id === tab);
  if (!entry || entry.values === null) return true;
  return entry.values.includes(category);
}

export function CompetitionFilters({
  category,
  onCategoryChange,
  status,
  onStatusChange,
  resultCount,
}: {
  category: CategoryTab;
  onCategoryChange: (value: CategoryTab) => void;
  status: StatusTab;
  onStatusChange: (value: StatusTab) => void;
  resultCount: number;
}) {
  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Kategórie súťaží"
        className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1"
      >
        {CATEGORY_TABS.map((t) => {
          const active = t.id === category;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onCategoryChange(t.id)}
              className={`min-h-[44px] flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition ${
                active ? "bg-white text-[#C62828] shadow-sm" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tablist"
        aria-label="Stav súťaže"
        className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1"
      >
        {STATUS_TABS.map((t) => {
          const active = t.id === status;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onStatusChange(t.id)}
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
        Zobrazených: <span className="font-semibold tabular-nums">{resultCount}</span>
      </p>
    </div>
  );
}
