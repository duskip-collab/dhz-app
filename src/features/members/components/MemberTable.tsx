"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import type { Member } from "@/lib/members/members.service";
import { MemberAvatar, MembershipBadge, MemberStatusBadge, ageFromBirthDate, maskPhone } from "./MemberBadges";

export function MemberTable({
  members,
  canEdit,
}: {
  members: Member[];
  canEdit: boolean;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
            <th scope="col" className="px-5 py-3 font-semibold">Člen</th>
            <th scope="col" className="hidden px-5 py-3 font-semibold lg:table-cell">Registračné číslo</th>
            <th scope="col" className="px-5 py-3 font-semibold">Kategória</th>
            <th scope="col" className="hidden px-5 py-3 font-semibold xl:table-cell">Vek</th>
            <th scope="col" className="hidden px-5 py-3 font-semibold lg:table-cell">Telefón</th>
            <th scope="col" className="px-5 py-3 text-right font-semibold">Stav</th>
            {canEdit ? (
              <th scope="col" className="px-5 py-3 text-right font-semibold"><span className="sr-only">Akcie</span></th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const age = ageFromBirthDate(m.birth_date);
            return (
              <tr key={m.id} className="border-b border-gray-50 transition last:border-0 hover:bg-gray-50/60">
                <td className="px-5 py-3">
                  <Link href={`/members/${m.id}`} className="flex items-center gap-3 hover:underline">
                    <MemberAvatar firstName={m.first_name} lastName={m.last_name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">
                        {m.title ? `${m.title} ` : ""}{m.first_name} {m.last_name}
                      </p>
                      <p className="truncate text-xs text-gray-400">{m.member_number}</p>
                      {m.position ? (
                        <p className="truncate text-xs font-medium text-[#C62828]">{m.position}</p>
                      ) : null}
                    </div>
                  </Link>
                </td>
                <td className="hidden px-5 py-3 tabular-nums text-gray-600 lg:table-cell">{m.member_number}</td>
                <td className="px-5 py-3">
                  <MembershipBadge type={m.membership_type} />
                </td>
                <td className="hidden px-5 py-3 tabular-nums text-gray-600 xl:table-cell">
                  {age === null ? "—" : `${age} r.`}
                </td>
                <td className="hidden px-5 py-3 tabular-nums text-gray-600 lg:table-cell">{maskPhone(m.phone)}</td>
                <td className="px-5 py-3 text-right">
                  <MemberStatusBadge status={m.status} />
                </td>
                {canEdit ? (
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/members/${m.id}/edit`}
                      aria-label={`Upraviť ${m.first_name} ${m.last_name}`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
                    >
                      <Pencil className="h-4 w-4" /> Upraviť
                    </Link>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
