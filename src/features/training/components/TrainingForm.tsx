"use client";

import { useActionState, useEffect } from "react";
import type { Training, TrainingTargetGroup } from "@/lib/training/training.service";
import type { Member } from "@/lib/members/members.service";
import type { TrainingActionState } from "@/app/(app)/training/actions";

const TARGET_GROUPS: { value: TrainingTargetGroup; label: string }[] = [
  { value: "ALL", label: "Všetci" },
  { value: "ADULT", label: "Dospelí" },
  { value: "YOUTH", label: "Mládež" },
  { value: "PREPARATORY", label: "Prípravka" },
  { value: "DORAST", label: "Dorast" },
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

export function TrainingForm({
  training,
  trainers,
  action,
  onCancel,
  onSuccess,
}: {
  training?: Training | null;
  trainers: Member[];
  action: (prev: TrainingActionState | null, formData: FormData) => Promise<TrainingActionState>;
  onCancel: () => void;
  onSuccess?: (trainingId: string) => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok && state.trainingId && onSuccess) onSuccess(state.trainingId);
  }, [state, onSuccess]);

  const errors = !state || state.ok ? {} : state.errors;

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.ok && state.message ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
          {state.message}
        </p>
      ) : null}

      <Field label="Názov tréningu" name="title" error={errors.title} required>
        <input id="title" name="title" defaultValue={training?.title ?? ""} required className={inputCls} />
      </Field>

      <Field label="Popis" name="description" error={errors.description}>
        <textarea
          id="description"
          name="description"
          defaultValue={training?.description ?? ""}
          rows={3}
          className={`${inputCls} min-h-[80px] resize-y`}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cieľová skupina" name="target_group" error={errors.target_group} required>
          <select id="target_group" name="target_group" defaultValue={training?.target_group ?? "ALL"} className={inputCls}>
            {TARGET_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hlavný tréner" name="trainer_id" error={errors.trainer_id}>
          <select id="trainer_id" name="trainer_id" defaultValue={training?.trainer_id ?? ""} className={inputCls}>
            <option value="">— Neurčený —</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.first_name} {t.last_name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Začiatok" name="start_time" error={errors.start_time} required>
          <input
            id="start_time"
            name="start_time"
            type="datetime-local"
            defaultValue={toLocalInput(training?.start_time ?? null)}
            required
            className={inputCls}
          />
        </Field>
        <Field label="Koniec" name="end_time" error={errors.end_time} required>
          <input
            id="end_time"
            name="end_time"
            type="datetime-local"
            defaultValue={toLocalInput(training?.end_time ?? null)}
            required
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Miesto" name="location" error={errors.location}>
        <input id="location" name="location" defaultValue={training?.location ?? ""} placeholder="Has.zbor, telocvičňa…" className={inputCls} />
      </Field>

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
          {pending ? "Ukladám…" : training ? "Uložiť zmeny" : "Pridať tréning"}
        </button>
      </div>
    </form>
  );
}

