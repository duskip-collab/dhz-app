import { Siren, Clock, MapPin, Trophy } from "lucide-react";
import type { IncidentStats as Stats } from "@/types/incidents";
import { incidentTypeLabel } from "./IncidentBadges";

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

export function IncidentStats({ stats }: { stats: Stats }) {
  const km = Math.round(stats.totalKilometers * 10) / 10;
  const hours = Math.round(stats.totalEngineHours * 10) / 10;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={<Siren className="h-4 w-4" />}
        label="Celkový počet výjazdov"
        value={stats.total}
        sub={`${stats.completedCount} dokončených`}
      />
      <StatCard
        icon={<Clock className="h-4 w-4" />}
        label="Odpracované motohodiny"
        value={`${hours} h`}
      />
      <StatCard
        icon={<MapPin className="h-4 w-4" />}
        label="Najazdené kilometre"
        value={`${km} km`}
      />
      <StatCard
        icon={<Trophy className="h-4 w-4" />}
        label="Najčastejší typ"
        value={stats.mostFrequentType ? incidentTypeLabel(stats.mostFrequentType) : "—"}
      />
    </div>
  );
}
