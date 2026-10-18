import Link from "next/link";
import { CalendarClock, MapPin, Trophy, UserRound, Users } from "lucide-react";
import type { Competition } from "@/lib/competitions/competition.service";
import { CategoryBadge, CompetitionStatusBadge, LeagueBadge } from "./CompetitionBadges";

const dateFmt = new Intl.DateTimeFormat("sk-SK", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit" });

function formatDate(dateIso: string, endIso: string | null): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = timeFmt.format(d);
  const end = endIso ? new Date(endIso) : null;
  const endTime = end && !Number.isNaN(end.getTime()) ? ` – ${timeFmt.format(end)}` : "";
  return `${dateFmt.format(d)} · ${time}${endTime}`;
}

export function CompetitionCard({
  competition,
  teamCount,
}: {
  competition: Competition;
  teamCount?: number;
}) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-red-200 hover:shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-gray-900">{competition.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm tabular-nums text-gray-600">
            <CalendarClock className="h-4 w-4 text-gray-400" />
            {formatDate(competition.date, competition.end_time)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-gray-400" />
              {competition.location ?? "Miesto neurčené"}
            </span>
            {competition.organizer ? (
              <span className="flex items-center gap-1.5">
                <UserRound className="h-4 w-4 text-gray-400" />
                {competition.organizer}
              </span>
            ) : null}
            {typeof teamCount === "number" ? (
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-gray-400" />
                {teamCount === 0
                  ? "Bez tímov DHZ"
                  : `${teamCount} ${teamCount === 1 ? "tím DHZ" : teamCount < 5 ? "tímy DHZ" : "tímov DHZ"}`}
              </span>
            ) : null}
          </div>
          {competition.league ? (
            <div className="mt-2">
              <LeagueBadge league={competition.league} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <CompetitionStatusBadge status={competition.status} />
          <CategoryBadge category={competition.category} />
        </div>
      </div>
      <div className="mt-3 border-t border-gray-50 pt-3">
        <Link
          href={`/competitions/${competition.id}`}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-[#C62828] transition hover:border-red-200 hover:bg-red-50/50"
        >
          <Trophy className="h-4 w-4" /> Detail súťaže
        </Link>
      </div>
    </li>
  );
}
