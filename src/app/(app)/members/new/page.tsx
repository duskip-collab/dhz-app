import { ArrowLeft, UserPlus } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { MemberCreatePage } from "@/features/members/components/MemberCreatePage";

export default async function NewMemberPage() {
  await requirePermission(PERMISSIONS.MEMBERS_CREATE);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/members"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
      >
        <ArrowLeft className="h-4 w-4" /> Späť na členov
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pridať člena</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vyplňte údaje nového člena DHZ. Pre mládežnícke kategórie je povinný
          zákonný zástupca.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          <UserPlus className="h-4 w-4" /> Nový člen
        </p>
        <MemberCreatePage />
      </div>
    </div>
  );
}