"use client";

import { useActionState, useEffect } from "react";
import type { Competition, CompetitionCategory } from "@/lib/competitions/competition.service";
import type { CompetitionActionState } from "@/app/(app)/competitions/actions";

const CATEGORIES: { value: CompetitionCategory; label: string }[] = [
  { value: "MEN", label: "Muži" },
  { value: "WOMEN", label: "Ženy" },
  { value: "DORAST_BOYS", label: "Dorast – chlapci" },
  { value: "DORAST_GIRLS", label: "Dorast – dievčatá" },
  { value: "PLAMEN_BOYS", label: "Plameň – chlapci" },
  { value: "PLAMEN_GIRLS", label: "Plameň – dievčatá" },
  { value: "MIX", label: "Mix" },
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
        <p role="alert" className="mt-1 text-xs text-[#C62828]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[48px]";

// Prevod ISO času na hodnotu pre input type="datetime-local".
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CompetitionForm({
  competition,
  action,
  onCancel,
  onSuccess,
}: {
  competition?: Competition | null;
  action: (prev: CompetitionActionState | null, formData: FormData) => Promise<CompetitionActionState>;
  onCancel: () => void;
  onSuccess?: (competitionId: string) => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok && state.competitionId && onSuccess) onSuccess(state.competitionId);
  }, [state, onSuccess]);

  const errors = !state || state.ok ? {} : state.errors;

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.ok && state.message ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
          {state.message}
        </p>
      ) : null}

      <Field label="Názov súťaže" name="title" error={errors.title} required>
        <input id="title" name="title" defaultValue={competition?.title ?? ""} required className={inputCls} />
      </Field>

      <Field label="Popis" name="description" error={errors.description}>
        <textarea
          id="description"
          name="description"
          defaultValue={competition?.description ?? ""}
          rows={3}
          className={`${inputCls} min-h-[80px] resize-y`}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kategória" name="category" error={errors.category} required>
          <select id="category" name="category" defaultValue={competition?.category ?? "MEN"} className={inputCls}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Liga" name="league" error={errors.league}>
          <input id="league" name="league" defaultValue={competition?.league ?? ""} placeholder="Západoslovenská hasičská liga…" className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organizátor" name="organizer" error={errors.organizer}>
          <input id="organizer" name="organizer" defaultValue={competition?.organizer ?? ""} placeholder="DHZ / zodpovedná osoba…" className={inputCls} />
        </Field>
        <Field label="Miesto" name="location" error={errors.location}>
          <input id="location" name="location" defaultValue={competition?.location ?? ""} placeholder="Štadión, obec…" className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dátum a čas konania" name="date" error={errors.date} required>
          <input
            id="date"
            name="date"
            type="datetime-local"
            defaultValue={toLocalInput(competition?.date ?? null)}
            required
            className={inputCls}
          />
        </Field>
        <Field label="Čas konca (nepovinné)" name="end_time" error={errors.end_time}>
          <input
            id="end_time"
            name="end_time"
            type="datetime-local"
            defaultValue={toLocalInput(competition?.end_time ?? null)}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="min-h-[48px] rounded-lg border border-gray-200 px-5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:opacity-50"
        >
          Zrušiť
        </button>
        <button
          type="submit"
          disabled={pending}
          className="min-h-[48px] rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] focus:ring-2 focus:ring-[#C62828] focus:ring-offset-2 disabled:opacity-50"
        >
          {pending ? "Ukladám…" : competition ? "Uložiť zmeny" : "Pridať súťaž"}
        </button>
      </div>
    </form>
  );
}

