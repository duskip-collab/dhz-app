"use client";

import Link from "next/link";
import { PackageX } from "lucide-react";
import type {
  EquipmentItem,
  EquipmentCategory,
  InventoryAvailability,
} from "@/lib/equipment/equipment.service";
import { StatusBadge, ConditionBadge, expiryClass, formatDate, expiryLabel } from "./EquipmentBadges";

function categoryName(categories: EquipmentCategory[], id: string): string {
  return categories.find((c) => c.id === id)?.name ?? "—";
}

function identifier(item: EquipmentItem): string {
  return item.inventory_number ?? item.serial_number ?? "—";
}

export function EquipmentList({
  items,
  categories,
  availability,
}: {
  items: EquipmentItem[];
  categories: EquipmentCategory[];
  availability?: Record<string, InventoryAvailability>;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <PackageX className="h-6 w-6" />
        </span>
        <div>
          <p className="font-semibold text-gray-900">Nenašiel sa žiadny majetok</p>
          <p className="mt-1 text-sm text-gray-500">
            Upravte filtre alebo pridajte novú položku inventára.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Tabuľka pre väčšie obrazovky */}
      <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <th scope="col" className="px-4 py-3 font-semibold">Názov</th>
              <th scope="col" className="px-4 py-3 font-semibold">Kategória</th>
              <th scope="col" className="px-4 py-3 font-semibold">Inv. / sér. č.</th>
              <th scope="col" className="px-4 py-3 font-semibold">Umiestnenie</th>
              <th scope="col" className="px-4 py-3 font-semibold">Stav</th>
              <th scope="col" className="px-4 py-3 font-semibold">Opotreb.</th>
              <th scope="col" className="px-4 py-3 font-semibold">Najbližší termín</th>
              <th scope="col" className="px-4 py-3 font-semibold">Kusy</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Akcie</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-50 transition last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">{item.name}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{categoryName(categories, item.category_id)}</td>
                <td className="px-4 py-3 tabular-nums text-gray-600">{identifier(item)}</td>
                <td className="px-4 py-3 text-gray-600">{item.location ?? "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                <td className="px-4 py-3"><ConditionBadge condition={item.condition} /></td>
                <td className="px-4 py-3">
                  <span className={`tabular-nums ${expiryClass(item.next_inspection_date)}`}>
                    {formatDate(item.next_inspection_date)}
                  </span>
                  {item.next_inspection_date ? (
                    <span className="block text-xs text-gray-400">{expiryLabel(item.next_inspection_date)}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {(() => {
                    const av = availability?.[item.id];
                    const total = av?.total ?? item.quantity ?? 1;
                    const available = av?.available ?? total;
                    const assigned = av?.assigned ?? 0;
                    return (
                      <span className="tabular-nums">
                        {total}
                        <span className="block text-xs text-gray-400">
                          {available} dostupných · {assigned} pridelených
                        </span>
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/inventory/${item.id}`}
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

      {/* Karty pre mobil */}
      <ul className="space-y-3 lg:hidden">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-400">{categoryName(categories, item.category_id)}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ConditionBadge condition={item.condition} />
              <span className="text-xs text-gray-500">Inv: {identifier(item)}</span>
              {item.location ? <span className="text-xs text-gray-500">· {item.location}</span> : null}
              <span className="text-xs text-gray-500">· {item.quantity ?? 1} ks</span>
            </div>
            {item.next_inspection_date ? (
              <p className={`mt-2 text-xs tabular-nums ${expiryClass(item.next_inspection_date)}`}>
                Termín: {formatDate(item.next_inspection_date)} ({expiryLabel(item.next_inspection_date)})
              </p>
            ) : null}
            <div className="mt-3">
              <Link
                href={`/inventory/${item.id}`}
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

export function EquipmentListSkeleton() {
  return (
    <div aria-hidden className="space-y-3">
      <div className="hidden h-12 animate-pulse rounded-xl bg-gray-100 lg:block" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
      ))}
    </div>
  );
}

