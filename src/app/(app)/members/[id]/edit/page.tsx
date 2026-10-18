import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getMemberById, getMemberPhotoUrl, listMemberGuardians } from "@/lib/members/members.service";
import { MemberEditPage } from "@/features/members/components/MemberEditPage";

export const metadata = {
  title: "Upraviť člena",
};

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  await requirePermission(PERMISSIONS.MEMBERS_EDIT);

  let member;
  try {
    member = await getMemberById(id);
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 404) {
      notFound();
    }
    throw e;
  }

  // Ochrana údajov: fotografia sa načíta len so signed URL a výhradne serverovo.
  let photoUrl: string | null = null;
  if (member.photo_path) {
    try {
      photoUrl = await getMemberPhotoUrl(member.photo_path);
    } catch {
      photoUrl = null;
    }
  }

  const guardians = await listMemberGuardians(id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/members"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
      >
        <ArrowLeft className="h-4 w-4" /> Späť na členov
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upraviť člena</h1>
        <p className="mt-1 text-sm text-gray-500">
          {member.title ? `${member.title} ` : ""}
          {member.first_name} {member.last_name}
        </p>
      </div>

      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
        <Pencil className="h-4 w-4" /> Údaje člena
      </p>

      <MemberEditPage member={member} guardians={guardians} photoUrl={photoUrl} />
    </div>
  );
}