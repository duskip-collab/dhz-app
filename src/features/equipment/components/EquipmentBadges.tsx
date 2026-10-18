import type { EquipmentItem } from "@/lib/equipment/equipment.service";

type Status = EquipmentItem["status"];
type Condition = EquipmentItem["condition"];

const STATUS_LABELS: Record<Status, string> = {
  AVAILABLE: "🟢 K dispozícii",
  IN_SERVICE: "🔵 V servise",
  RESERVED: "🟡 Rezervované",
  DAMAGED: "🔴 Poškodené",
  DISPOSED: "⚫ Vyradené",
};

const STATUS_STYLES: Record<Status, string> = {
  AVAILABLE: "bg-green-50 text-green-700",
  IN_SERVICE: "bg-blue-50 text-blue-700",
  RESERVED: "bg-amber-50 text-amber-700",
  DAMAGED: "bg-red-50 text-[#C62828]",
  DISPOSED: "bg-gray-100 text-gray-600",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const CONDITION_LABELS: Record<Condition, string> = {
  NEW: "Nové",
  GOOD: "Dobrý",
  FAIR: "Uspokojivý",
  POOR: "Zlý",
  UNSERVICEABLE: "Nepoužiteľné",
};

const CONDITION_STYLES: Record<Condition, string> = {
  NEW: "bg-emerald-50 text-emerald-700",
  GOOD: "bg-green-50 text-green-700",
  FAIR: "bg-yellow-50 text-yellow-700",
  POOR: "bg-orange-50 text-orange-700",
  UNSERVICEABLE: "bg-red-50 text-[#C62828]",
};

export function ConditionBadge({ condition }: { condition: Condition }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CONDITION_STYLES[condition] ?? "bg-gray-100 text-gray-700"}`}
    >
      {CONDITION_LABELS[condition] ?? condition}
    </span>
  );
}

// Počet dní do dátumu (záporné = po termíne). Vracia null pre prázdny dátum.
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = target.getTime() - startOfToday.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

// Farebné odlíšenie exspirácie: červená <= 7 dní, oranžová <= 30 dní, inak neutrálna.
export function expiryClass(iso: string | null): string {
  const days = daysUntil(iso);
  if (days === null) return "text-gray-500";
  if (days < 0) return "text-[#C62828] font-semibold";
  if (days <= 7) return "text-[#C62828] font-semibold";
  if (days <= 30) return "text-orange-600 font-semibold";
  return "text-gray-600";
}

const dateFmt = new Intl.DateTimeFormat("sk-SK", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFmt.format(d);
}

export function expiryLabel(iso: string | null): string {
  const days = daysUntil(iso);
  if (days === null) return "—";
  if (days < 0) return `po termíne (${Math.abs(days)} dní)`;
  if (days === 0) return "dnes";
  return `za ${days} dní`;
}
