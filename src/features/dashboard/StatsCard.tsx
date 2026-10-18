import type { LucideIcon } from "lucide-react";

export function StatsCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-gray-400">{hint}</p>
        </div>
        <span className="w-10 h-10 rounded-lg bg-red-50 text-[#C62828] flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </span>
      </div>
      <span className="inline-block mt-3 text-[11px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-2 py-0.5">
        Demo
      </span>
    </div>
  );
}
