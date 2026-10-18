import Link from "next/link";
import { CalendarClock, MapPin, UserRound } from "lucide-react";
import type { Training } from "@/lib/training/training.service";
import { TargetGroupBadge, TrainingStatusBadge } from "./TrainingBadges";

const dateFmt = new Intl.DateTimeFormat("sk-SK", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("sk-SK", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime())) return "—";
  const date = dateFmt.format(start);
  const startTime = timeFmt.format(start);
  const endTime = Number.isNaN(end.getTime()) ? "" : ` – ${timeFmt.format(end)}`;
  return `${date} · ${startTime}${endTime}`;
}

function trainerName(trainer: Training["trainer"]): string {
  if (!trainer) return "Neurčený tréner";
  return `${trainer.first_name} ${trainer.last_name}`.trim() || "Neurčený tréner";
}

export function TrainingCard({ training }: { training: Training }) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-red-200 hover:shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-gray-900">{training.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm tabular-nums text-gray-600">
            <CalendarClock className="h-4 w-4 text-gray-400" />
            {formatRange(training.start_time, training.end_time)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-gray-400" />
              {training.location ?? "Miesto neurčené"}
            </span>
            <span className="flex items-center gap-1.5">
              <UserRound className="h-4 w-4 text-gray-400" />
              {trainerName(training.trainer)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <TrainingStatusBadge status={training.status} />
          <TargetGroupBadge group={training.target_group} />
        </div>
      </div>
      <div className="mt-3 border-t border-gray-50 pt-3">
        <Link
          href={`/training/${training.id}`}
          className="inline-flex min-h-[40px] items-center rounded-lg border border-gray-200 px-3 text-sm font-semibold text-[#C62828] transition hover:border-red-200 hover:bg-red-50/50"
        >
          Detail tréningu
        </Link>
      </div>
    </li>
  );
}
