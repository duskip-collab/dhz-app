import { AlertTriangle, Package, Wrench, CalendarClock, CheckCircle2 } from "lucide-react";
import type { EquipmentItem } from "@/lib/equipment/equipment.service";
import { daysUntil, formatDate, expiryClass } from "./EquipmentBadges";

function StatCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {icon}
        {label}
      </div>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums ${
          tone === "warn" ? "text-[#C62828]" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function EquipmentStats({
  items,
  expiring,
}: {
  items: EquipmentItem[];
  expiring: EquipmentItem[];
}) {
  const total = items.length;
  const available = items.filter((i) => i.status === "AVAILABLE").length;
  const inServiceOrDamaged = items.filter(
    (i) => i.status === "IN_SERVICE" || i.status === "DAMAGED"
  ).length;
  const expiringSoon = expiring.filter((i) => {
    const d = daysUntil(i.next_inspection_date);
    return d !== null && d <= 30;
  });

  // Zoradené podľa najbližšieho termínu pre prehľad.
  const upcoming = [...expiringSoon].sort((a, b) => {
    const da = daysUntil(a.next_inspection_date) ?? 999;
    const db = daysUntil(b.next_inspection_date) ?? 999;
    return da - db;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Package className="h-4 w-4" />} label="Celkom položiek" value={total} />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="K dispozícii"
          value={available}
        />
        <StatCard
          icon={<Wrench className="h-4 w-4" />}
          label="V servise / poškodené"
          value={inServiceOrDamaged}
        />
        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Blížiace sa exspirácie"
          value={expiringSoon.length}
          tone={expiringSoon.length > 0 ? "warn" : "default"}
        />
      </div>

      {upcoming.length > 0 ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-amber-900">
                Upozornenie na končiacu STK/EK/revíziu ({upcoming.length})
              </p>
              <ul className="mt-2 space-y-1">
                {upcoming.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-medium text-amber-900">{item.name}</span>
                    <span className="text-amber-700">·</span>
                    <span className={`tabular-nums ${expiryClass(item.next_inspection_date)}`}>
                      {formatDate(item.next_inspection_date)}
                    </span>
                  </li>
                ))}
              </ul>
              {upcoming.length > 5 ? (
                <p className="mt-1 text-xs text-amber-700">
                  …a ďalších {upcoming.length - 5} položiek.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
