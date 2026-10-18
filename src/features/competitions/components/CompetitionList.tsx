"use client";

import { useMemo, useState } from "react";
import { CalendarX2 } from "lucide-react";
import type { Competition } from "@/lib/competitions/competition.service";
import {
  CompetitionFilters,
  categoryMatches,
  type CategoryTab,
  type StatusTab,
} from "./CompetitionFilters";
import { CompetitionCard } from "./CompetitionCard";

export function CompetitionList({
  competitions,
}: {
  competitions: Competition[];
}) {
  const [category, setCategory] = useState<CategoryTab>("ALL");
  const [status, setStatus] = useState<StatusTab>("PLANNED");

  const filtered = useMemo(() => {
    return competitions.filter((c) => {
      if (!categoryMatches(category, c.category)) return false;
      if (status !== "ALL" && c.status !== status) return false;
      return true;
    });
  }, [competitions, category, status]);

  const resetFilters = () => {
    setCategory("ALL");
    setStatus("PLANNED");
  };

  return (
    <div className="space-y-4">
      <CompetitionFilters
        category={category}
        onCategoryChange={setCategory}
        status={status}
        onStatusChange={setStatus}
        resultCount={filtered.length}
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <CalendarX2 className="h-6 w-6" />
          </span>
          <div>
            <p className="font-semibold text-gray-900">Nenašli sa žiadne súťaže</p>
            <p className="mt-1 text-sm text-gray-500">
              Skúste upraviť filtre kategórie alebo stavu súťaže.
            </p>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
          >
            Zrušiť filtre
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((competition) => (
            <CompetitionCard key={competition.id} competition={competition} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function CompetitionSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
      <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
