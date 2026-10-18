"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { EquipmentCategory } from "@/lib/equipment/equipment.service";
import { EquipmentForm } from "./EquipmentFormModal";
import { createEquipmentAction } from "@/app/(app)/inventory/actions";

export function NewEquipmentButton({ categories }: { categories: EquipmentCategory[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C62828] px-4 font-semibold text-white shadow-sm transition hover:bg-[#8E0000] focus:ring-2 focus:ring-[#C62828] focus:ring-offset-2"
      >
        <Plus className="h-5 w-5" /> Nová položka
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Nová položka inventára"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Nová položka inventára</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                Zavrieť
              </button>
            </div>
            <EquipmentForm
              categories={categories}
              action={createEquipmentAction}
              onCancel={() => setOpen(false)}
              onSuccess={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
