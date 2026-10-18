"use client";

import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import type { Member } from "@/lib/members/members.service";
import { MEMBER_TAB_FILTERS, MemberFilters, type MemberTab } from "./MemberFilters";
import { MemberTable } from "./MemberTable";
import { MemberCardList } from "./MemberCardList";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function MemberList({
  members,
  canEdit,
}: {
  members: Member[];
  canEdit: boolean;
}) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<MemberTab>("all");

  const filtered = useMemo(() => {
    const filter = MEMBER_TAB_FILTERS[tab];
    const q = normalize(search.trim());
    return members.filter((m) => {
      if (filter.status && m.status !== filter.status) return false;
      if (filter.membershipTypes && !filter.membershipTypes.includes(m.membership_type)) return false;
      if (!q) return true;
      const haystack = normalize(`${m.first_name} ${m.last_name} ${m.member_number}`);
      return haystack.includes(q);
    });
  }, [members, search, tab]);

  return (
    <div className="space-y-4">
      <MemberFilters
        search={search}
        onSearchChange={setSearch}
        tab={tab}
        onTabChange={setTab}
        resultCount={filtered.length}
      />
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <SearchX className="h-6 w-6" />
          </span>
          <div>
            <p className="font-semibold text-gray-900">Nenašli sa žiadni členovia</p>
            <p className="mt-1 text-sm text-gray-500">
              Skúste upraviť vyhľadávanie alebo zvoliť inú kategóriu.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setTab("all");
            }}
            className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
          >
            Zrušiť filtre
          </button>
        </div>
      ) : (
        <>
          <MemberTable members={filtered} canEdit={canEdit} />
          <MemberCardList members={filtered} canEdit={canEdit} />
        </>
      )}
    </div>
  );
}

export function MemberListSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
      <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
