"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { AdminMemberManager } from "@/features/admin/components/AdminMemberManager";
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

export default function AdminClientView({
  overview,
}: {
  overview: AdminOverview;
}) {
  const [selectedMember, setSelectedMember] =
    useState<MemberWithRoles | null>(null);

  const membersWithRoles: MemberWithRoles[] =
    (overview?.members ?? []).map((m: AdminMemberRow) => {
      const userRoles = (overview.userRoles ?? []).filter(
        (r: AdminUserRole) => r.user_id === m.auth_user_id
      );
      const userPerms = (overview.userPermissions ?? []).filter(
        (p: AdminUserPermission) => p.user_id === m.auth_user_id
      );
      return {
        ...m,
        roles: userRoles.map((r: AdminUserRole) => r.role_code).filter(Boolean),
        permissions: userPerms
          .map((p: AdminUserPermission) => p.permission_code)
          .filter(Boolean),
      };
    }
  );

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

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#C62828]/10 text-[#C62828]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </span>
            <h2 className="text-base font-bold text-gray-900">Členovia – roly a oprávnenia</h2>
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
                <th scope="col" className="px-4 py-3 font-semibold hidden md:table-cell">Pozícia</th>
                <th scope="col" className="px-4 py-3 font-semibold hidden md:table-cell">E-mail</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Akcie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {membersWithRoles.map((m: MemberWithRoles) => (
                <tr key={m.member_id ?? m.auth_user_id ?? m.member_number} className="hover:bg-gray-50/60 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C62828]/10 text-[#C62828]">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {m.first_name} {m.last_name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{m.member_number}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                    {m.position ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                    {m.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedMember(m)}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                      Spravovať
                    </button>
                  </td>
                </tr>
              ))}
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
    </div>
  );
}