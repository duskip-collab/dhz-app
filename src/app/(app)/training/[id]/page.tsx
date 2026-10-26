import { notFound } from "next/navigation";
import { ArrowLeft, Dumbbell } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getTrainingById,
  type TrainingTargetGroup,
} from "@/lib/training/training.service";
import { listMembers, type Member } from "@/lib/members/members.service";
import { TrainingHeader } from "@/features/training/components/TrainingHeader";
import { AttendanceManager } from "@/features/training/components/AttendanceManager";
import { TrainingDetailActions } from "@/features/training/components/TrainingDetailActions";

// Mapovanie cieľovej skupiny tréningu -> kategória člena pre načítanie dochádzky.
const GROUP_TO_MEMBERSHIP: Partial<Record<TrainingTargetGroup, Member["membership_type"]>> = {
  ADULT: "adult",
  YOUTH: "youth",
  PREPARATORY: "preparatory",
  DORAST: "dorast",
};

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission(PERMISSIONS.TRAINING_VIEW);

  let training: Awaited<ReturnType<typeof getTrainingById>> | null = null;
  try {
    training = await getTrainingById(id);
  } catch {
    training = null;
  }
  if (!training) notFound();

  // Členovia pre evidenciu dochádzky podľa cieľovej skupiny (inak všetci aktívni).
  const membership = GROUP_TO_MEMBERSHIP[training.target_group];
  let members: Member[] = [];
  try {
    members = await listMembers({ status: "active", membership_type: membership });
  } catch {
    members = [];
  }

  // Zoznam trénerov pre formulár (aktívni členovia).
  let trainers: Member[] = [];
  try {
    trainers = await listMembers({ status: "active" });
  } catch {
    trainers = [];
  }

  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.TRAINING_EDIT);

  return (
    <div className="space-y-6">
      <Link
        href="/training"
        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-[#C62828]"
      >
        <ArrowLeft className="h-4 w-4" /> Späť na tréningy
      </Link>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          <Dumbbell className="h-4 w-4" /> Tréning
        </p>
        <TrainingHeader training={training} canEdit={canEdit} trainers={trainers} />
      </div>

      <TrainingDetailActions id={training.id} />

      <AttendanceManager

        trainingId={training.id}
        members={members}
        attendance={training.attendance}
        canEdit={canEdit}
      />
    </div>
  );
}
