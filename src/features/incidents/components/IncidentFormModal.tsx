"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { Member } from "@/lib/members/members.service";
import type { EquipmentItem } from "@/lib/equipment/equipment.service";
import type {
  IncidentType,
  IncidentStatus,
  ResponderRole,
  CreateIncidentInput,
} from "@/types/incidents";
import type { IncidentActionState } from "@/app/(app)/dashboard/incidents/actions";
import { createIncidentAction } from "@/app/(app)/dashboard/incidents/actions";

const TYPES: { value: IncidentType; label: string }[] = [
  { value: "FIRE", label: "Požiar" },
  { value: "TECHNICAL", label: "Technický zásah" },
  { value: "FLOOD", label: "Povodeň" },
  { value: "TRAFFIC_ACCIDENT", label: "Dopravná nehoda" },
  { value: "TACTICAL_EXERCISE", label: "Taktické cvičenie" },
  { value: "OTHER", label: "Iné" },
];

const STATUSES: { value: IncidentStatus; label: string }[] = [
  { value: "REPORTED", label: "Nahlásený" },
  { value: "IN_PROGRESS", label: "Prebieha" },
  { value: "COMPLETED", label: "Dokončený" },
  { value: "CANCELLED", label: "Zrušený" },
];

const ROLES: { value: ResponderRole; label: string }[] = [
  { value: "COMMANDER", label: "Veliteľ" },
  { value: "DRIVER", label: "Strojník" },
  { value: "FIREFIGHTER", label: "Hasič" },
  { value: "SUPPORT", label: "Podpora" },
];

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

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ResponderRow {
  member_id: string;
  role: ResponderRole;
}

interface EquipmentRow {
  equipment_id: string;
  engine_hours_used: string;
  kilometers_driven: string;
}

export function IncidentFormModal({
  members,
  equipment,
  onClose,
  onSuccess,
}: {
  members: Member[];
  equipment: EquipmentItem[];
  onClose: () => void;
  onSuccess?: (id: string) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [incidentNumber, setIncidentNumber] = useState("");
  const [type, setType] = useState<IncidentType>("FIRE");
  const [status, setStatus] = useState<IncidentStatus>("REPORTED");
  const [location, setLocation] = useState("");
  const [gps, setGps] = useState("");
  const [description, setDescription] = useState("");
  const [reportedAt, setReportedAt] = useState(nowLocal());
  const [dispatchedAt, setDispatchedAt] = useState("");
  const [arrivedAt, setArrivedAt] = useState("");
  const [returnedAt, setReturnedAt] = useState("");
  const [responders, setResponders] = useState<ResponderRow[]>([{ member_id: "", role: "COMMANDER" }]);
  const [equipmentRows, setEquipmentRows] = useState<EquipmentRow[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addResponder() {
    setResponders((r) => [...r, { member_id: "", role: "FIREFIGHTER" }]);
  }
  function updateResponder(index: number, patch: Partial<ResponderRow>) {
    setResponders((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function removeResponder(index: number) {
    setResponders((rows) => rows.filter((_, i) => i !== index));
  }
  function addEquipmentRow() {
    setEquipmentRows((r) => [...r, { equipment_id: "", engine_hours_used: "", kilometers_driven: "" }]);
  }
  function updateEquipmentRow(index: number, patch: Partial<EquipmentRow>) {
    setEquipmentRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function removeEquipmentRow(index: number) {
    setEquipmentRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const payload: CreateIncidentInput = {
      incident_number: incidentNumber || null,
      title,
      type,
      status,
      location,
      gps_coordinates: gps || null,
      description: description || null,
      reported_at: reportedAt,
      dispatched_at: dispatchedAt || null,
      arrived_at: arrivedAt || null,
      returned_at: returnedAt || null,
      responders: responders
        .filter((r) => r.member_id)
        .map((r) => ({ member_id: r.member_id, role: r.role })),
      equipment: equipmentRows
        .filter((r) => r.equipment_id)
        .map((r) => ({
          equipment_id: r.equipment_id,
          engine_hours_used: r.engine_hours_used ? Number(r.engine_hours_used) : null,
          kilometers_driven: r.kilometers_driven ? Number(r.kilometers_driven) : null,
        })),
    };

    try {
      const result: IncidentActionState = await createIncidentAction(null, payload);
      if (result.ok) {
        onClose();
        router.push(`/dashboard/incidents/${result.incidentId}`);
        router.refresh();
        onSuccess?.(result.incidentId!);
      } else {
        setError(result.message);
      }
    } catch {
      setError("Operácia zlyhala.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Evidovať nový výjazd"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Evidovať nový výjazd</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm text-gray-500 hover:bg-gray-100">
            Zavrieť
          </button>
        </div>
        {error ? (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
            {error}
          </p>
        ) : null}


        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Názov" name="title" required>
              <input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} />
            </Field>
            <Field label="Číslo výjazdu" name="incident_number">
              <input id="incident_number" name="incident_number" value={incidentNumber} onChange={(e) => setIncidentNumber(e.target.value)} className={inputCls} placeholder="IV-2024/001" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Typ" name="type" required>
              <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as IncidentType)} className={inputCls}>
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Stav" name="status" required>
              <select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as IncidentStatus)} className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Miesto" name="location" required>
              <input id="location" name="location" value={location} onChange={(e) => setLocation(e.target.value)} required className={inputCls} />
            </Field>
            <Field label="GPS súradnice" name="gps_coordinates">
              <input id="gps_coordinates" name="gps_coordinates" value={gps} onChange={(e) => setGps(e.target.value)} className={inputCls} placeholder="48.3, 17.2" />
            </Field>
          </div>

          <Field label="Popis" name="description">
            <textarea id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputCls} resize-y`} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ohlásenie" name="reported_at" required>
              <input id="reported_at" name="reported_at" type="datetime-local" value={reportedAt} onChange={(e) => setReportedAt(e.target.value)} required className={inputCls} />
            </Field>
            <Field label="Výjazd" name="dispatched_at">
              <input id="dispatched_at" name="dispatched_at" type="datetime-local" value={dispatchedAt} onChange={(e) => setDispatchedAt(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Príchod" name="arrived_at">
              <input id="arrived_at" name="arrived_at" type="datetime-local" value={arrivedAt} onChange={(e) => setArrivedAt(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Návrat" name="returned_at">
              <input id="returned_at" name="returned_at" type="datetime-local" value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} className={inputCls} />
            </Field>
          </div>


          {/* Posádka */}
          <fieldset className="space-y-3 rounded-xl border border-gray-200 p-4">
            <legend className="px-2 text-sm font-bold text-gray-900">Posádka</legend>
            {responders.map((row, index) => (
              <div key={`resp-${index}`} className="flex flex-wrap items-center gap-2">
                <select
                  value={row.member_id}
                  onChange={(e) => updateResponder(index, { member_id: e.target.value })}
                  aria-label="Člen posádky"
                  className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
                >
                  <option value="">— Vybrať člena —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} ({m.member_number})
                    </option>
                  ))}
                </select>
                <select
                  value={row.role}
                  onChange={(e) => updateResponder(index, { role: e.target.value as ResponderRole })}
                  aria-label="Rola"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeResponder(index)}
                  aria-label="Odstrániť člena"
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-red-200 hover:text-[#C62828]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addResponder}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 text-sm font-semibold text-gray-600 transition hover:border-[#C62828] hover:text-[#C62828]"
            >
              <Plus className="h-4 w-4" /> Pridať člena
            </button>
          </fieldset>

          {/* Technika */}
          <fieldset className="space-y-3 rounded-xl border border-gray-200 p-4">
            <legend className="px-2 text-sm font-bold text-gray-900">Použitá technika</legend>
            {equipmentRows.map((row, index) => (
              <div key={`eq-${index}`} className="flex flex-wrap items-center gap-2">
                <select
                  value={row.equipment_id}
                  onChange={(e) => updateEquipmentRow(index, { equipment_id: e.target.value })}
                  aria-label="Technika"
                  className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
                >
                  <option value="">— Vybrať techniku —</option>
                  {equipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Motohod."
                  aria-label="Motohodiny"
                  value={row.engine_hours_used}
                  onChange={(e) => updateEquipmentRow(index, { engine_hours_used: e.target.value })}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Km"
                  aria-label="Kilometre"
                  value={row.kilometers_driven}
                  onChange={(e) => updateEquipmentRow(index, { kilometers_driven: e.target.value })}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[44px] focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
                />
                <button
                  type="button"
                  onClick={() => removeEquipmentRow(index)}
                  aria-label="Odstrániť techniku"
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-red-200 hover:text-[#C62828]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addEquipmentRow}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 text-sm font-semibold text-gray-600 transition hover:border-[#C62828] hover:text-[#C62828]"
            >
              <Plus className="h-4 w-4" /> Pridať techniku
            </button>
          </fieldset>


          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className="min-h-[44px] rounded-lg border border-gray-200 px-5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:opacity-50">
              Zrušiť
            </button>
            <button type="submit" disabled={pending} className="min-h-[44px] rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50">
              {pending ? "Ukladám…" : "Uložiť výjazd"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

