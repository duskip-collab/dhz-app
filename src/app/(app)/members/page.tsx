import Link from "next/link";
import { CheckCircle2, Plus, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { listMembers } from "@/lib/members/members.service";
import { MemberList } from "@/features/members/components/MemberList";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.MEMBERS_VIEW);

  const sp = await searchParams;
  const success =
    typeof sp.success === "string" ? sp.success : undefined;

  let members: Awaited<ReturnType<typeof listMembers>> = [];
  try {
    members = await listMembers({ status: undefined });
  } catch {
    members = [];
  }

  const activeCount = members.filter((m) => m.status === "active").length;
  const canCreate = hasPermission(ctx.permissions, PERMISSIONS.MEMBERS_CREATE);
  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.MEMBERS_EDIT);
  const successMessage =
    success === "created"
      ? "Člen bol úspešne pridaný."
      : success === "updated"
        ? "Zmeny boli úspešne uložené."
        : null;

  return (
    <div className="space-y-6">
      {successMessage ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {successMessage}
          <Link
            href="/members"
            className="ml-auto text-xs font-semibold text-green-700 underline underline-offset-2"
          >
            Zavrieť
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            <Users className="h-4 w-4" /> DHZ
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Členovia DHZ</h1>
          <p className="mt-1 text-sm text-gray-500">
            Aktívnych členov: <span className="font-semibold tabular-nums text-gray-800">{activeCount}</span>
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/members/new"
            className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-[#C62828] px-4 font-semibold text-white shadow-sm transition hover:bg-[#8E0000] focus:ring-2 focus:ring-[#C62828] focus:ring-offset-2"
          >
            <Plus className="h-5 w-5" /> Pridať člena
          </Link>
        ) : null}
      </div>
      <MemberList members={members} canEdit={canEdit} />
    </div>
  );
}
