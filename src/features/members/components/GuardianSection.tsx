"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import type { MemberGuardian } from "@/lib/members/members.service";
import { maskPhone } from "./MemberBadges";
import type { ActionState } from "@/app/(app)/members/actions";

export type GuardianCreateAction = (
  memberId: string,
  prev: ActionState | null,
  formData: FormData
) => Promise<ActionState>;

export type GuardianUpdateAction = (
  memberId: string,
  guardianId: string,
  prev: ActionState | null,
  formData: FormData
) => Promise<ActionState>;

export type GuardianDeleteAction = (
  memberId: string,
  guardianId: string
) => Promise<ActionState>;

const inputCls =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[48px]";

export function GuardianSection({
  memberId,
  guardians,
  canEdit,
  createAction,
  updateAction,
  deleteAction,
}: {
  memberId: string;
  guardians: MemberGuardian[];
  canEdit: boolean;
  createAction: GuardianCreateAction;
  updateAction: GuardianUpdateAction;
  deleteAction: GuardianDeleteAction;
}) {
  const [list, setList] = useState<MemberGuardian[]>(guardians);
  const [showForm, setShowForm] = useState(false);
  const [state, formAction, pending] = useActionState(
    createAction.bind(null, memberId),
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const errors = !state || state.ok ? {} : state.errors;

  // Pri zmene člena (prechod na iný detail) sa lokálny zoznam zosynchronizuje.
  useEffect(() => {
    // zámerná synchronizácia z props – nie render-phase setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList(guardians);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  // Po úspešnom pridaní – pridanie/aktualizácia lokálneho záznamu (dedup-safe).
  useEffect(() => {
    if (!state?.ok || !state.guardian) return;
    const created = state.guardian;
    // reakcia na dokončenie server action (zmiešané stavy cez prev)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList((prev) => {
      const exists = prev.some((g) => g.id === created.id);
      return exists
        ? prev.map((g) => (g.id === created.id ? created : g))
        : [...prev, created];
    });
    setShowForm(false);
  }, [state]);

  function handleUpdated(updated: MemberGuardian) {
    setList((prev) =>
      prev.some((g) => g.id === updated.id)
        ? prev.map((g) => (g.id === updated.id ? updated : g))
        : [...prev, updated],
    );
  }

  async function handleDelete(guardianId: string) {
    setDeletingId(guardianId);
    setDeleteError(null);
    startTransition(async () => {
      try {
        const res = await deleteAction(memberId, guardianId);
        if (res.ok) {
          if (res.guardianId) {
            setList((prev) => prev.filter((g) => g.id !== res.guardianId));
          }
        } else {
          setDeleteError(res.message);
        }
      } finally {
        setDeletingId(null);
      }
    });
  }
return (
    <section
      aria-labelledby="guardians-heading"
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="guardians-heading" className="flex items-center gap-2 text-base font-bold text-gray-900">
          <UserCheck className="h-5 w-5 text-[#C62828]" /> Zákonní zástupcovia
        </h2>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
          >
            <Plus className="h-4 w-4" /> {showForm ? "Skryť formulár" : "Pridať zástupcu"}
          </button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">
          Zatiaľ nie je evidovaný žiadny zákonný zástupca.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((g) => (
            <GuardianRow
              key={g.id}
              guardian={g}
              memberId={memberId}
              canEdit={canEdit}
              updateAction={updateAction}
              deleting={deletingId === g.id}
              onDelete={handleDelete}
              onUpdated={handleUpdated}
            />
          ))}
        </ul>
      )}

      {deleteError ? (
        <p role="alert" className="mt-3 text-sm text-[#C62828]">
          {deleteError}
        </p>
      ) : null}

      {showForm && canEdit ? (
        <form action={formAction} className="mt-4 space-y-4 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="guardian_full_name" className="mb-1.5 block text-sm font-medium text-gray-700">
                Meno zástupcu <span aria-hidden className="text-[#C62828]">*</span>
              </label>
              <input id="guardian_full_name" name="guardian_name" required className={inputCls} autoComplete="off" />
              {errors.guardian_name ? (
                <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.guardian_name}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="guardian_relationship_new" className="mb-1.5 block text-sm font-medium text-gray-700">
                Vzťah <span aria-hidden className="text-[#C62828]">*</span>
              </label>
              <input id="guardian_relationship_new" name="guardian_relationship" placeholder="matka / otec / zákonný zástupca" required className={inputCls} />
              {errors.guardian_relationship ? (
                <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.guardian_relationship}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="guardian_phone_new" className="mb-1.5 block text-sm font-medium text-gray-700">
                Telefón <span aria-hidden className="text-[#C62828]">*</span>
              </label>
              <input id="guardian_phone_new" name="guardian_phone" type="tel" placeholder="+421 9xx xxx xxx" required className={inputCls} />
              {errors.guardian_phone ? (
                <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.guardian_phone}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="guardian_email_new" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input id="guardian_email_new" name="guardian_email" type="email" className={inputCls} />
              {errors.guardian_email ? (
                <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.guardian_email}</p>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white transition hover:bg-[#8E0000] disabled:opacity-50"
            >
              {pending ? "Ukladám…" : "Uložiť zástupcu"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
function GuardianRow({
  guardian,
  memberId,
  canEdit,
  updateAction,
  deleting,
  onDelete,
  onUpdated,
}: {
  guardian: MemberGuardian;
  memberId: string;
  canEdit: boolean;
  updateAction: GuardianUpdateAction;
  deleting: boolean;
  onDelete: (guardianId: string) => void;
  onUpdated: (guardian: MemberGuardian) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateAction.bind(null, memberId, guardian.id),
    null,
  );

  const errors = !state || state.ok ? {} : state.errors;

  useEffect(() => {
    if (state?.ok && state.guardian) {
      onUpdated(state.guardian);
      // zatvorenie editovacieho formulára – reakcia na server action
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(false);
    }
  }, [state, onUpdated]);

  if (editing) {
    return (
      <li className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
        <form action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`guardian_name_${guardian.id}`} className="mb-1.5 block text-sm font-medium text-gray-700">
                Meno zástupcu <span aria-hidden className="text-[#C62828]">*</span>
              </label>
              <input
                id={`guardian_name_${guardian.id}`}
                name="guardian_name"
                defaultValue={guardian.guardian_full_name}
                required
                className={inputCls}
                autoComplete="off"
              />
              {errors.guardian_name ? (
                <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.guardian_name}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor={`guardian_relationship_${guardian.id}`} className="mb-1.5 block text-sm font-medium text-gray-700">
                Vzťah <span aria-hidden className="text-[#C62828]">*</span>
              </label>
              <input
                id={`guardian_relationship_${guardian.id}`}
                name="guardian_relationship"
                defaultValue={guardian.relationship}
                required
                className={inputCls}
              />
              {errors.guardian_relationship ? (
                <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.guardian_relationship}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`guardian_phone_${guardian.id}`} className="mb-1.5 block text-sm font-medium text-gray-700">
                Telefón <span aria-hidden className="text-[#C62828]">*</span>
              </label>
              <input
                id={`guardian_phone_${guardian.id}`}
                name="guardian_phone"
                type="tel"
                defaultValue={guardian.phone ?? ""}
                required
                className={inputCls}
              />
              {errors.guardian_phone ? (
                <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.guardian_phone}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor={`guardian_email_${guardian.id}`} className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input
                id={`guardian_email_${guardian.id}`}
                name="guardian_email"
                type="email"
                defaultValue={guardian.email ?? ""}
                className={inputCls}
              />
              {errors.guardian_email ? (
                <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.guardian_email}</p>
              ) : null}
            </div>
          </div>
          {state && !state.ok && state.message ? (
            <p role="alert" className="text-sm text-[#C62828]">{state.message}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:opacity-50"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white transition hover:bg-[#8E0000] disabled:opacity-50"
            >
              {pending ? "Ukladám…" : "Uložiť"}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 p-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
          {guardian.relationship}
          {guardian.is_primary_contact ? (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
              primárny kontakt
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm text-gray-700">{guardian.guardian_full_name}</p>
        <p className="mt-1 text-sm tabular-nums text-gray-600">Tel.: {maskPhone(guardian.phone)}</p>
        {guardian.email ? (
          <a href={`mailto:${guardian.email}`} className="text-sm text-gray-600 underline-offset-2 hover:underline">
            {guardian.email}
          </a>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Upraviť ${guardian.guardian_full_name}`}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-red-200 hover:text-[#C62828]"
          >
            <Pencil className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => onDelete(guardian.id)}
            aria-label={`Odstrániť ${guardian.guardian_full_name}`}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-[#C62828] transition hover:border-red-200 hover:bg-red-50/50 disabled:opacity-50"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      ) : null}
    </li>
  );
}