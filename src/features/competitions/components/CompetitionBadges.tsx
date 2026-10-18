import type {
  CompetitionCategory,
  CompetitionStatus,
} from "@/lib/competitions/competition.service";

const CATEGORY_LABELS: Record<CompetitionCategory, string> = {
  MEN: "Muži",
  WOMEN: "Ženy",
  DORAST_BOYS: "Dorast",
  DORAST_GIRLS: "Dorast",
  PLAMEN_BOYS: "Plameň",
  PLAMEN_GIRLS: "Plameň",
  MIX: "Mix",
};

const CATEGORY_STYLES: Record<CompetitionCategory, string> = {
  MEN: "bg-indigo-50 text-indigo-700",
  WOMEN: "bg-pink-50 text-pink-700",
  DORAST_BOYS: "bg-blue-50 text-blue-700",
  DORAST_GIRLS: "bg-sky-50 text-sky-700",
  PLAMEN_BOYS: "bg-amber-50 text-amber-700",
  PLAMEN_GIRLS: "bg-orange-50 text-orange-700",
  MIX: "bg-purple-50 text-purple-700",
};

export function CategoryBadge({ category }: { category: CompetitionCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_STYLES[category] ?? "bg-gray-100 text-gray-700"}`}
    >
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

const STATUS_STYLES: Record<CompetitionStatus, string> = {
  PLANNED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-[#C62828]",
};

const STATUS_LABELS: Record<CompetitionStatus, string> = {
  PLANNED: "🔵 Plánovaná",
  COMPLETED: "🟢 Dokončená",
  CANCELLED: "🔴 Zrušená",
};

export function CompetitionStatusBadge({ status }: { status: CompetitionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function LeagueBadge({ league }: { league: string | null }) {
  if (!league) return null;
  return (
    <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
      {league}
    </span>
  );
}
