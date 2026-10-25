"use client";

import Link from "next/link";
import { Pencil, Phone } from "lucide-react";
import type { Member } from "@/lib/members/members.service";
import { MemberAvatar, MembershipBadge, MemberStatusBadge, maskPhone } from "./MemberBadges";

export function MemberCardList({
  members,
  canEdit,
}: {
  members: Member[];
  canEdit: boolean;
}) {
  return (
    <ul className="grid gap-3 md:hidden">
      {members.map((m) => (
        <li
          key={m.id}
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <MemberAvatar firstName={m.first_name} lastName={m.last_name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-900">
                {m.title ? `${m.title} ` : ""}{m.first_name} {m.last_name}
              </p>
              <p className="truncate text-xs tabular-nums text-gray-400">{m.member_number}</p>
              {m.position ? (
                <p className="truncate text-xs font-medium text-[#C62828]">{m.position}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <MembershipBadge type={m.membership_type} />
                <MemberStatusBadge status={m.status} />
              </div>
            </div>
            {m.phone ? (
              <a
                href={`tel:${m.phone.replace(/\s/g, "")}`}
                aria-label={`Zavolať ${m.first_name} ${m.last_name}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 text-[#C62828] transition hover:border-red-200 hover:bg-red-50/50"
              >
                <Phone className="h-5 w-5" />
              </a>
            ) : null}
          </div>
          <p className="mt-3 border-t border-gray-50 pt-2 text-xs tabular-nums text-gray-500">
            Tel.: {maskPhone(m.phone)}
          </p>
          <Link
            href={`/members/${m.id}`}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
          >
            Zobraziť profil
          </Link>
          {canEdit ? (
            <Link
              href={`/members/${m.id}/edit`}
              className="mt-2 ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
            >
              <Pencil className="h-4 w-4" /> Upraviť
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
