"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import type {
  AdminMemberRow,
  AdminUserRole,
  AdminUserPermission,
} from "@/lib/admin/admin.service";

type AdminOverview = {
  members: AdminMemberRow[];
  userRoles: AdminUserRole[];
  userPermissions: AdminUserPermission[];
};

type MemberWithRoles = AdminMemberRow & {
  roles: string[];
  permissions: string[];
};

const AdminMemberManager = dynamic(
  () =>
    import("@/features/admin/components/MemberAccessEditor").then(
      (module) => module.MemberAccessEditor,
    ),
  {
    loading: () => (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 py-10"
        role="status"
        aria-live="polite"
      >
        <div className="w-full max-w-2xl animate-pulse rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-6 h-6 w-48 rounded bg-gray-200" />
          <div className="space-y-3">
            <div className="h-24 rounded-xl bg-gray-100" />
            <div className="h-32 rounded-xl bg-gray-100" />
          </div>
          <span className="sr-only">Načítavam správu člena…</span>
        </div>
      </div>
    ),
  },
);

const MemberRows = memo(function MemberRows({
  members,
  onSelect,
}: {
  members: MemberWithRoles[];
  onSelect: (member: MemberWithRoles) => void;
}) {
  return (
    <>
      {members.map((member) => (
        <tr
          key={member.member_id ?? member.auth_user_id ?? member.member_number}
          className="transition hover:bg-gray-50/60"
        >
          <td className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C62828]/10 text-[#C62828]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">
                  {member.first_name} {member.last_name}
                </p>
                <p className="truncate text-xs text-gray-500">{member.member_number}</p>
              </div>
            </div>
          </td>
          <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
            {member.position ?? "—"}
          </td>
          <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
            {member.email ?? "—"}
          </td>
          <td className="px-4 py-3 text-right">
            <button
              type="button"
              onClick={() => onSelect(member)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              Spravovať
            </button>
          </td>
        </tr>
      ))}
    </>
  );
});

function AdminMemberTable({ members }: { members: MemberWithRoles[] }) {
  const [selectedMember, setSelectedMember] = useState<MemberWithRoles | null>(null);
  const handleSelectMember = useCallback((member: MemberWithRoles) => {
    setSelectedMember(member);
  }, []);

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#C62828]/10 text-[#C62828]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </span>
            <h2 className="text-base font-bold text-gray-900">
              Členovia – roly a oprávnenia
            </h2>
          </div>
          <Link
            href="/admin/invitations"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Pozývacie kódy
          </Link>
        </div>
        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th scope="col" className="px-4 py-3 font-semibold">Člen</th>
                <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">Pozícia</th>
                <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">E-mail</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Akcie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <MemberRows members={members} onSelect={handleSelectMember} />
            </tbody>
          </table>
        </div>
      </section>

      {selectedMember && (
        <AdminMemberManager
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </>
  );
}

export default function AdminClientView({ overview }: { overview: AdminOverview }) {
  const membersWithRoles = useMemo(() => {
    const rolesByUser = new Map<string, string[]>();
    for (const role of overview.userRoles) {
      const roles = rolesByUser.get(role.user_id) ?? [];
      roles.push(role.role_code);
      rolesByUser.set(role.user_id, roles);
    }

    const permissionsByUser = new Map<string, string[]>();
    for (const permission of overview.userPermissions) {
      const permissions = permissionsByUser.get(permission.user_id) ?? [];
      permissions.push(permission.permission_code);
      permissionsByUser.set(permission.user_id, permissions);
    }

    return overview.members.map((member) => {
      const userId = member.auth_user_id;
      return {
        ...member,
        roles: userId ? rolesByUser.get(userId) ?? [] : [],
        permissions: userId ? permissionsByUser.get(userId) ?? [] : [],
      };
    });
  }, [overview.members, overview.userPermissions, overview.userRoles]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-[#C62828]" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administrácia</h1>
          <p className="text-sm text-gray-500">
            Správa členov, ról, oprávnení a prístupových kódov.
          </p>
        </div>
      </div>
      <AdminMemberTable members={membersWithRoles} />
    </div>
  );
}
