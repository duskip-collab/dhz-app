import type {
  TrainingStatus,
  TrainingTargetGroup,
} from "@/features/training/schemas/training.validation";

const TARGET_GROUP_LABELS: Record<TrainingTargetGroup, string> = {
  ALL: "Všetci",
  ADULT: "Dospelí",
  YOUTH: "Mládež",
  PREPARATORY: "Prípravka",
  DORAST: "Dorast",
};

const TARGET_GROUP_STYLES: Record<TrainingTargetGroup, string> = {
  ALL: "bg-gray-100 text-gray-700",
  ADULT: "bg-indigo-50 text-indigo-700",
  YOUTH: "bg-blue-50 text-blue-700",
  PREPARATORY: "bg-sky-50 text-sky-700",
  DORAST: "bg-amber-50 text-amber-700",
};

export function TargetGroupBadge({ group }: { group: TrainingTargetGroup }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TARGET_GROUP_STYLES[group] ?? "bg-gray-100 text-gray-700"}`}
    >
      {TARGET_GROUP_LABELS[group] ?? group}
    </span>
  );
}

const STATUS_STYLES: Record<TrainingStatus, string> = {
  PLANNED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-[#C62828]",
};

const STATUS_LABELS: Record<TrainingStatus, string> = {
  PLANNED: "🔵 Plánovaný",
  COMPLETED: "🟢 Dokončený",
  CANCELLED: "🔴 Zrušený",
};

export function TrainingStatusBadge({ status }: { status: TrainingStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
