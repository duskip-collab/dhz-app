import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getCompetitionById } from "@/lib/competitions/competition.service";
import { listMembers, type Member } from "@/lib/members/members.service";
import { CompetitionHeader } from "@/features/competitions/components/CompetitionHeader";
import { TeamsSection } from "@/features/competitions/components/TeamsSection";

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission(PERMISSIONS.COMPETITION_VIEW);

  let competition: Awaited<ReturnType<typeof getCompetitionById>> | null = null;
  try {
    competition = await getCompetitionById(id);
  } catch {
    competition = null;
  }
  if (!competition) notFound();

  // Aktívni členovia pre výber do súpisiek.
  let members: Member[] = [];
  try {
    members = await listMembers({ status: "active" });
  } catch {
    members = [];
  }

  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.COMPETITION_EDIT);

  return (
    <div className="space-y-6">
      <Link
        href="/competitions"
        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-[#C62828]"
      >
        <ArrowLeft className="h-4 w-4" /> Späť na súťaže
      </Link>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          <Trophy className="h-4 w-4" /> Súťaž
        </p>
        <CompetitionHeader competition={competition} canEdit={canEdit} />
      </div>

      <TeamsSection competition={competition} members={members} canEdit={canEdit} />
    </div>
  );
}
