import type { IncidentType, IncidentStatus, ResponderRole } from "@/types/incidents";

const TYPE_LABELS: Record<IncidentType, string> = {
  FIRE: "Požiar",
  TECHNICAL: "Technický zásah",
  FLOOD: "Povodeň",
  TRAFFIC_ACCIDENT: "Dopravná nehoda",
  TACTICAL_EXERCISE: "Taktické cvičenie",
  OTHER: "Iné",
};

const TYPE_STYLES: Record<IncidentType, string> = {
  FIRE: "bg-red-50 text-[#C62828]",
  TECHNICAL: "bg-blue-50 text-blue-700",
  FLOOD: "bg-cyan-50 text-cyan-700",
  TRAFFIC_ACCIDENT: "bg-orange-50 text-orange-700",
  TACTICAL_EXERCISE: "bg-purple-50 text-purple-700",
  OTHER: "bg-gray-100 text-gray-700",
};

export function TypeBadge({ type }: { type: IncidentType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_STYLES[type] ?? "bg-gray-100 text-gray-700"}`}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

const STATUS_LABELS: Record<IncidentStatus, string> = {
  REPORTED: "🔵 Nahlásený",
  IN_PROGRESS: "🟠 Prebieha",
  COMPLETED: "🟢 Dokončený",
  CANCELLED: "🔴 Zrušený",
};

const STATUS_STYLES: Record<IncidentStatus, string> = {
  REPORTED: "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-orange-50 text-orange-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-[#C62828]",
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const ROLE_LABELS: Record<ResponderRole, string> = {
  COMMANDER: "Veliteľ",
  DRIVER: "Strojník",
  FIREFIGHTER: "Hasič",
  SUPPORT: "Podpora",
};

const ROLE_STYLES: Record<ResponderRole, string> = {
  COMMANDER: "bg-indigo-50 text-indigo-700",
  DRIVER: "bg-amber-50 text-amber-700",
  FIREFIGHTER: "bg-green-50 text-green-700",
  SUPPORT: "bg-gray-100 text-gray-600",
};

export function RoleBadge({ role }: { role: ResponderRole }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_STYLES[role] ?? "bg-gray-100 text-gray-700"}`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export function incidentTypeLabel(type: IncidentType): string {
  return TYPE_LABELS[type] ?? type;
}

const dtFmt = new Intl.DateTimeFormat("sk-SK", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dtFmt.format(d);
}
