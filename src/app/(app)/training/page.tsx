import { Dumbbell } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getTrainings } from "@/lib/training/training.service";
import { listMembers } from "@/lib/members/members.service";
import { TrainingList } from "@/features/training/components/TrainingList";
import { NewTrainingButton } from "@/features/training/components/NewTrainingButton";

export default async function Page() {
  const ctx = await requirePermission(PERMISSIONS.TRAINING_VIEW);

  let trainings: Awaited<ReturnType<typeof getTrainings>> = [];
  try {
    trainings = await getTrainings();
  } catch {
    trainings = [];
  }

  const canCreate = hasPermission(ctx.permissions, PERMISSIONS.TRAINING_CREATE);

  let trainers: Awaited<ReturnType<typeof listMembers>> = [];
  if (canCreate) {
    try {
      trainers = await listMembers({ status: "active" });
    } catch {
      trainers = [];
    }
  }

  const plannedCount = trainings.filter((t) => t.status === "PLANNED").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            <Dumbbell className="h-4 w-4" /> DHZ
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Tréningy a výcvik</h1>
          <p className="mt-1 text-sm text-gray-500">
            Plánovaných tréningov:{" "}
            <span className="font-semibold tabular-nums text-gray-800">{plannedCount}</span>
          </p>
        </div>
        {canCreate ? <NewTrainingButton trainers={trainers} /> : null}
      </div>
      <TrainingList trainings={trainings} />
    </div>
  );
}


