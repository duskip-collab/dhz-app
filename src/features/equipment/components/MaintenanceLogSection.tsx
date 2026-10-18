"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Plus } from "lucide-react";
import type { EquipmentItemDetail, MaintenanceLog } from "@/lib/equipment/equipment.service";
import { addMaintenanceLogAction } from "@/app/(app)/inventory/actions";
import { formatDate, expiryClass } from "./EquipmentBadges";

const TYPES = [
  { value: "STK_EK", label: "STK / EK" },
  { value: "REVISION", label: "Revízia" },
  { value: "SERVICE_CHECK", label: "Servisná kontrola" },
  { value: "REPAIR", label: "Oprava" },
  { value: "INSPECTION", label: "Tlaková skúška / kontrola" },
] as const;

const TYPE_LABELS: Record<MaintenanceLog["type"], string> = {
  STK_EK: "STK / EK",
  REVISION: "Revízia",
  SERVICE_CHECK: "Servisná kontrola",
  REPAIR: "Oprava",
  INSPECTION: "Tlaková skúška",
};

const inputCls =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[44px]";

const moneyFmt = new Intl.NumberFormat("sk-SK", {
  style: "currency",
  currency: "EUR",
});

function AddLogModal({
  item,
  onClose,
}: {
  item: EquipmentItemDetail;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addMaintenanceLogAction, null);

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  const errors = !state || state.ok ? {} : state.errors;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pridať servisný záznam"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">Pridať servisný záznam</h2>
        <form action={formAction} className="space-y-4">
          {state && !state.ok && state.message ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
              {state.message}
            </p>
          ) : null}
          <input type="hidden" name="equipment_id" value={item.id} />

          <div>
            <label htmlFor="type" className="mb-1.5 block text-sm font-medium text-gray-700">Typ záznamu</label>
            <select id="type" name="type" required defaultValue="REVISION" className={inputCls}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {errors.type ? (
              <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.type}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-gray-700">Názov</label>
            <input id="title" name="title" required className={inputCls} />
            {errors.title ? (
              <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.title}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="performed_at" className="mb-1.5 block text-sm font-medium text-gray-700">Dátum vykonania</label>
              <input id="performed_at" name="performed_at" type="date" required className={inputCls} />
              {errors.performed_at ? (
                <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.performed_at}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="next_due_date" className="mb-1.5 block text-sm font-medium text-gray-700">
                Nový dátum revízie
              </label>
              <input id="next_due_date" name="next_due_date" type="date" className={inputCls} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cost" className="mb-1.5 block text-sm font-medium text-gray-700">Náklady (€)</label>
              <input id="cost" name="cost" type="number" step="0.01" min="0" defaultValue="0" className={inputCls} />
            </div>
            <div>
              <label htmlFor="performed_by" className="mb-1.5 block text-sm font-medium text-gray-700">Vyhotoviteľ</label>
              <input id="performed_by" name="performed_by" className={inputCls} />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className="min-h-[44px] rounded-lg border border-gray-200 px-5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:opacity-50">
              Zrušiť
            </button>
            <button type="submit" disabled={pending} className="min-h-[44px] rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50">
              {pending ? "Ukladám…" : "Pridať záznam"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MaintenanceLogSection({
  item,
  canEdit,
}: {
  item: EquipmentItemDetail;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const logs = item.recent_maintenance;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Wrench className="h-5 w-5 text-gray-400" /> Servis a revízie
        </h2>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000]"
          >
            <Plus className="h-4 w-4" /> Pridať servisný záznam
          </button>
        ) : null}
      </div>

      {logs.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          Zatiaľ nie sú evidované žiadne servisné záznamy.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th scope="col" className="px-3 py-2 font-semibold">Typ</th>
                <th scope="col" className="px-3 py-2 font-semibold">Názov / Popis</th>
                <th scope="col" className="px-3 py-2 font-semibold">Vykonané</th>
                <th scope="col" className="px-3 py-2 font-semibold">Náklady</th>
                <th scope="col" className="px-3 py-2 font-semibold">Vyhotoviteľ</th>
                <th scope="col" className="px-3 py-2 font-semibold">Ďalšia revízia</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                      {TYPE_LABELS[log.type] ?? log.type}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-gray-900">{log.title}</p>
                    {log.description ? (
                      <p className="text-xs text-gray-500">{log.description}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-gray-600">{formatDate(log.performed_at)}</td>
                  <td className="px-3 py-3 tabular-nums text-gray-600">
                    {log.cost ? moneyFmt.format(log.cost) : "—"}
                  </td>
                  <td className="px-3 py-3 text-gray-600">{log.performed_by ?? "—"}</td>
                  <td className={`px-3 py-3 tabular-nums ${expiryClass(log.next_due_date)}`}>
                    {formatDate(log.next_due_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? <AddLogModal item={item} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}

