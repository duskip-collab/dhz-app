"use client";

import Link from "next/link";
import { Siren } from "lucide-react";
import type { Incident } from "@/types/incidents";
import { TypeBadge, StatusBadge, formatDateTime } from "./IncidentBadges";

export function IncidentList({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <Siren className="h-6 w-6" />
        </span>
        <div>
          <p className="font-semibold text-gray-900">Nenašli sa žiadne výjazdy</p>
          <p className="mt-1 text-sm text-gray-500">
            Upravte filtre alebo evidujte nový výjazd.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <th scope="col" className="px-4 py-3 font-semibold">Výjazd</th>
              <th scope="col" className="px-4 py-3 font-semibold">Typ</th>
              <th scope="col" className="px-4 py-3 font-semibold">Miesto</th>
              <th scope="col" className="px-4 py-3 font-semibold">Nahlásené</th>
              <th scope="col" className="px-4 py-3 font-semibold">Stav</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Akcie</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((inc) => (
              <tr key={inc.id} className="border-b border-gray-50 transition last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">{inc.title}</p>
                  {inc.incident_number ? (
                    <p className="text-xs text-gray-400">#{inc.incident_number}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3"><TypeBadge type={inc.type} /></td>
                <td className="px-4 py-3 text-gray-600">{inc.location}</td>
                <td className="px-4 py-3 tabular-nums text-gray-600">{formatDateTime(inc.reported_at)}</td>
                <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/incidents/${inc.id}`}
                    className="inline-flex min-h-[36px] items-center rounded-lg border border-gray-200 px-3 text-sm font-semibold text-[#C62828] transition hover:border-red-200 hover:bg-red-50/50"
                  >
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {incidents.map((inc) => (
          <li key={inc.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{inc.title}</p>
                {inc.incident_number ? (
                  <p className="text-xs text-gray-400">#{inc.incident_number}</p>
                ) : null}
                <p className="text-xs text-gray-500">{inc.location}</p>
              </div>
              <StatusBadge status={inc.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TypeBadge type={inc.type} />
              <span className="text-xs tabular-nums text-gray-500">{formatDateTime(inc.reported_at)}</span>
            </div>
            <div className="mt-3">
              <Link
                href={`/dashboard/incidents/${inc.id}`}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-gray-200 px-3 text-sm font-semibold text-[#C62828] transition hover:border-red-200 hover:bg-red-50/50"
              >
                Detail
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
