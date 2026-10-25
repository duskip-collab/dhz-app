"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { EquipmentItemDetail } from "@/lib/equipment/equipment.service";
import type { EquipmentActionState } from "@/app/(app)/inventory/actions";
import { updateEquipmentAction } from "@/app/(app)/inventory/actions";

const STATUSES = [
  { value: "AVAILABLE", label: "K dispozícii" },
  { value: "IN_SERVICE", label: "V servise" },
  { value: "RESERVED", label: "Rezervované" },
  { value: "DAMAGED", label: "Poškodené" },
  { value: "DISPOSED", label: "Vyradené" },
] as const;

const CONDITIONS = [
  { value: "NEW", label: "Nové" },
  { value: "GOOD", label: "Dobrý" },
  { value: "FAIR", label: "Uspokojivý" },
  { value: "POOR", label: "Zlý" },
  { value: "UNSERVICEABLE", label: "Nepoužiteľné" },
] as const;

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-[#C62828]">{error}</p>
      ) : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[44px]";

function sliceDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function EquipmentEditModal({
  item,
  onClose,
}: {
  item: EquipmentItemDetail;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateEquipmentAction.bind(null, item.id) as (
      prev: EquipmentActionState | null,
      formData: FormData
    ) => Promise<EquipmentActionState>,
    null
  );

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  const errors = !state || state.ok ? {} : state.errors;
  const vehicle = item.vehicle_details;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upraviť položku"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Upraviť položku</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            Zavrieť
          </button>
        </div>

        <form action={formAction} className="space-y-5">
          {state && !state.ok && state.message ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
              {state.message}
            </p>
          ) : null}

          <Field label="Názov" name="name" error={errors.name}>
            <input id="name" name="name" defaultValue={item.name} required className={inputCls} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Inventárne číslo" name="inventory_number" error={errors.inventory_number}>
              <input id="inventory_number" name="inventory_number" defaultValue={item.inventory_number ?? ""} className={inputCls} />
            </Field>
            <Field label="Sériové číslo" name="serial_number" error={errors.serial_number}>
              <input id="serial_number" name="serial_number" defaultValue={item.serial_number ?? ""} className={inputCls} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Umiestnenie" name="location" error={errors.location}>
              <input id="location" name="location" defaultValue={item.location ?? ""} className={inputCls} />
            </Field>
            <Field label="Stav" name="status" error={errors.status}>
              <select id="status" name="status" defaultValue={item.status} className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stav opotrebovania" name="condition" error={errors.condition}>
              <select id="condition" name="condition" defaultValue={item.condition} className={inputCls}>
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Dátum najbližšej revízie" name="next_inspection_date" error={errors.next_inspection_date}>
              <input id="next_inspection_date" name="next_inspection_date" type="date" defaultValue={sliceDate(item.next_inspection_date)} className={inputCls} />
            </Field>
            <Field label="Počet kusov" name="quantity" error={errors.quantity}>
              <input id="quantity" name="quantity" type="number" min="0" step="1" defaultValue={item.quantity ?? 1} className={inputCls} />
            </Field>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="is_opp"
              defaultChecked={item.is_opp ?? false}
              className="h-5 w-5 rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]"
            />
            OOPP (osobný ochranný pracovný prostriedok)
          </label>


          {vehicle ? (
            <div className="grid gap-4 rounded-xl border border-gray-200 p-4 sm:grid-cols-2">
              <Field label="EČV" name="license_plate" error={errors.license_plate}>
                <input id="license_plate" name="license_plate" defaultValue={vehicle.license_plate ?? ""} className={inputCls} />
              </Field>
              <Field label="VIN" name="vin" error={errors.vin}>
                <input id="vin" name="vin" defaultValue={vehicle.vin ?? ""} className={inputCls} />
              </Field>
              <Field label="Stav km" name="mileage_km" error={errors.mileage_km}>
                <input id="mileage_km" name="mileage_km" type="number" step="1" min="0" defaultValue={vehicle.mileage_km} className={inputCls} />
              </Field>
              <Field label="Motohodiny" name="engine_hours" error={errors.engine_hours}>
                <input id="engine_hours" name="engine_hours" type="number" step="0.1" min="0" defaultValue={vehicle.engine_hours} className={inputCls} />
              </Field>
              <Field label="STK platné do" name="stk_valid_until" error={errors.stk_valid_until}>
                <input id="stk_valid_until" name="stk_valid_until" type="date" defaultValue={sliceDate(vehicle.stk_valid_until)} className={inputCls} />
              </Field>
              <Field label="EK platné do" name="ek_valid_until" error={errors.ek_valid_until}>
                <input id="ek_valid_until" name="ek_valid_until" type="date" defaultValue={sliceDate(vehicle.ek_valid_until)} className={inputCls} />
              </Field>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="min-h-[44px] rounded-lg border border-gray-200 px-5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:opacity-50"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              disabled={pending}
              className="min-h-[44px] rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] focus:ring-2 focus:ring-[#C62828] focus:ring-offset-2 disabled:opacity-50"
            >
              {pending ? "Ukladám…" : "Uložiť zmeny"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

