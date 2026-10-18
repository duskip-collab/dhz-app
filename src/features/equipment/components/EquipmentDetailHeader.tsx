"use client";

import { useState } from "react";
import { Pencil, MapPin, Hash } from "lucide-react";
import type { EquipmentItemDetail } from "@/lib/equipment/equipment.service";
import { StatusBadge, ConditionBadge } from "./EquipmentBadges";
import { EquipmentEditModal } from "./EquipmentEditModal";

export function EquipmentDetailHeader({
  item,
  canEdit,
}: {
  item: EquipmentItemDetail;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            {item.category ? (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                {item.category.name}
              </span>
            ) : null}
            {item.inventory_number ? (
              <span className="flex items-center gap-1.5 tabular-nums">
                <Hash className="h-4 w-4 text-gray-400" />
                {item.inventory_number}
              </span>
            ) : null}
            {item.serial_number ? (
              <span className="text-gray-500">S/N: {item.serial_number}</span>
            ) : null}
            {item.location ? (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-gray-400" />
                {item.location}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={item.status} />
          <ConditionBadge condition={item.condition} />
        </div>
      </div>

      {item.notes ? (
        <p className="mt-3 max-w-2xl rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {item.notes}
        </p>
      ) : null}

      {canEdit ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" /> Upraviť položku
          </button>
        </div>
      ) : null}

      {editing ? (
        <EquipmentEditModal item={item} onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}

