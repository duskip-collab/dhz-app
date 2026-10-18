"use client";

import type {
  TrainingStatus,
  TrainingTargetGroup,
} from "@/features/training/schemas/training.validation";

export type TargetGroupTab = "ALL" | "ADULT" | "YOUTH" | "PREPARATORY" | "DORAST";
export type StatusTab = "PLANNED" | "COMPLETED" | "CANCELLED" | "ALL";

const TARGET_TABS: { id: TargetGroupTab; label: string }[] = [
  { id: "ALL", label: "Všetci" },
  { id: "ADULT", label: "Dospelí" },
  { id: "YOUTH", label: "Mládež" },
  { id: "PREPARATORY", label: "Prípravka" },
  { id: "DORAST", label: "Dorast" },
];

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: "PLANNED", label: "Plánované" },
  { id: "COMPLETED", label: "Dokončené" },
  { id: "CANCELLED", label: "Zrušené" },
  { id: "ALL", label: "Všetky" },
];

export function TrainingFilters({
  targetGroup,
  onTargetGroupChange,
  status,
  onStatusChange,
  resultCount,
}: {
  targetGroup: TargetGroupTab;
  onTargetGroupChange: (value: TargetGroupTab) => void;
  status: StatusTab;
  onStatusChange: (value: StatusTab) => void;
  resultCount: number;
}) {
  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Cieľové skupiny"
        className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1"
      >
        {TARGET_TABS.map((t) => {
          const active = t.id === targetGroup;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onTargetGroupChange(t.id as TrainingTargetGroup)}
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
        aria-label="Stav tréningu"
        className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1"
      >
        {STATUS_TABS.map((t) => {
          const active = t.id === status;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onStatusChange(t.id as TrainingStatus | "ALL")}
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
