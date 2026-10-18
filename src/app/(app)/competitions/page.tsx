import { Trophy } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getCompetitions } from "@/lib/competitions/competition.service";
import { CompetitionList } from "@/features/competitions/components/CompetitionList";
import { NewCompetitionButton } from "@/features/competitions/components/NewCompetitionButton";

export default async function CompetitionsPage() {
  const ctx = await requirePermission(PERMISSIONS.COMPETITION_VIEW);

  let competitions: Awaited<ReturnType<typeof getCompetitions>> = [];
  try {
    competitions = await getCompetitions();
  } catch {
    competitions = [];
  }

  const upcomingCount = competitions.filter((c) => c.status === "PLANNED").length;
  const canCreate = hasPermission(ctx.permissions, PERMISSIONS.COMPETITION_CREATE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            <Trophy className="h-4 w-4" /> DHZ
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Súťaže a reprezentácia</h1>
          <p className="mt-1 text-sm text-gray-500">
            Nadchádzajúcich súťaží:{" "}
            <span className="font-semibold tabular-nums text-gray-800">{upcomingCount}</span>
          </p>
        </div>
        {canCreate ? <NewCompetitionButton /> : null}
      </div>
      <CompetitionList competitions={competitions} />
    </div>
  );
}

