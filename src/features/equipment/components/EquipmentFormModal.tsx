"use client";

import { useActionState, useEffect, useState } from "react";
import type { EquipmentCategory } from "@/lib/equipment/equipment.service";
import type { EquipmentActionState } from "@/app/(app)/inventory/actions";

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

const FUELS = ["DIESEL", "PETROL", "ELECTRIC"] as const;

function Field({
  label,
  name,
  error,
  children,
  required,
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required ? <span aria-hidden className="text-[#C62828]">*</span> : null}
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

export function EquipmentForm({
  categories,
  action,
  onCancel,
  onSuccess,
}: {
  categories: EquipmentCategory[];
  action: (prev: EquipmentActionState | null, formData: FormData) => Promise<EquipmentActionState>;
  onCancel: () => void;
  onSuccess?: (equipmentId: string) => void;
}) {
  const [isVehicle, setIsVehicle] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok && state.equipmentId && onSuccess) onSuccess(state.equipmentId);
  }, [state, onSuccess]);

  const errors = !state || state.ok ? {} : state.errors;

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.ok && state.message ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Názov" name="name" error={errors.name} required>
          <input id="name" name="name" required className={inputCls} placeholder="CAS 15, Prilba F1…" />
        </Field>
        <Field label="Kategória" name="category_id" error={errors.category_id} required>
          <select id="category_id" name="category_id" required defaultValue="" className={inputCls}>
            <option value="" disabled>— Vybrať —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inventárne číslo" name="inventory_number" error={errors.inventory_number}>
          <input id="inventory_number" name="inventory_number" className={inputCls} />
        </Field>
        <Field label="Sériové číslo" name="serial_number" error={errors.serial_number}>
          <input id="serial_number" name="serial_number" className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Umiestnenie" name="location" error={errors.location}>
          <input id="location" name="location" className={inputCls} placeholder="Garáž 1, Sklad…" />
        </Field>
        <Field label="Stav" name="status" error={errors.status} required>
          <select id="status" name="status" defaultValue="AVAILABLE" className={inputCls}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stav opotrebovania" name="condition" error={errors.condition} required>
          <select id="condition" name="condition" defaultValue="GOOD" className={inputCls}>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Dátum najbližšej revízie" name="next_inspection_date" error={errors.next_inspection_date}>
          <input id="next_inspection_date" name="next_inspection_date" type="date" className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dátum zakúpenia" name="purchase_date" error={errors.purchase_date}>
          <input id="purchase_date" name="purchase_date" type="date" className={inputCls} />
        </Field>
        <Field label="Cena (€)" name="purchase_price" error={errors.purchase_price}>
          <input id="purchase_price" name="purchase_price" type="number" step="0.01" min="0" className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Počet kusov" name="quantity" error={errors.quantity}>
          <input id="quantity" name="quantity" type="number" min="0" step="1" defaultValue={1} className={inputCls} />
        </Field>
        <label className="inline-flex cursor-pointer items-end gap-2 pb-3 text-sm text-gray-700">
          <input
            type="checkbox"
            name="is_opp"
            className="h-5 w-5 rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]"
          />
          OOPP (osobný ochranný pracovný prostriedok)
        </label>
      </div>


      {/* Prepínacie pole pre motorové vozidlo / príves */}
      <div className="rounded-xl border border-gray-200 p-4">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-800">
          <input
            type="checkbox"
            checked={isVehicle}
            onChange={(e) => setIsVehicle(e.target.checked)}
            className="h-5 w-5 rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]"
          />
          Ide o motorové vozidlo / príves
        </label>

        {isVehicle ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="EČV" name="license_plate" error={errors.license_plate}>
              <input id="license_plate" name="license_plate" className={inputCls} placeholder="XX-123AB" />
            </Field>
            <Field label="VIN" name="vin" error={errors.vin}>
              <input id="vin" name="vin" className={inputCls} />
            </Field>
            <Field label="Palivo" name="fuel_type" error={errors.fuel_type}>
              <select id="fuel_type" name="fuel_type" defaultValue="" className={inputCls}>
                <option value="">— Neurčené —</option>
                {FUELS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field label="Stav km / motohodín" name="mileage_km" error={errors.mileage_km}>
              <input id="mileage_km" name="mileage_km" type="number" step="1" min="0" defaultValue="0" className={inputCls} />
            </Field>
            <Field label="Motohodiny" name="engine_hours" error={errors.engine_hours}>
              <input id="engine_hours" name="engine_hours" type="number" step="0.1" min="0" defaultValue="0" className={inputCls} />
            </Field>
            <Field label="STK platné do" name="stk_valid_until" error={errors.stk_valid_until}>
              <input id="stk_valid_until" name="stk_valid_until" type="date" className={inputCls} />
            </Field>
            <Field label="EK platné do" name="ek_valid_until" error={errors.ek_valid_until}>
              <input id="ek_valid_until" name="ek_valid_until" type="date" className={inputCls} />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
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
          {pending ? "Ukladám…" : "Pridať položku"}
        </button>
      </div>
    </form>
  );
}

