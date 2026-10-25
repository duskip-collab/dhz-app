"use client";

import { useActionState, useEffect, useState } from "react";
import { Contact, ShieldCheck, User, UserRound } from "lucide-react";
import type { Member, MemberStatus, MembershipType } from "@/lib/members/members.service";
import {
  isYouthCategory,
  memberToFormValues,
  requiresGuardian,
} from "@/features/members/schemas/member.validation";
import type { ActionState } from "@/app/(app)/members/actions";
import { ConfirmDialog } from "./ConfirmDialog";

export const MEMBERSHIP_CATEGORIES: { value: MembershipType; label: string }[] = [
  { value: "adult", label: "Dospelý" },
  { value: "youth", label: "Mládež" },
  { value: "preparatory", label: "Prípravka" },
  { value: "dorast", label: "Dorast" },
];

const STATUS_OPTIONS: { value: MemberStatus; label: string }[] = [
  { value: "active", label: "Aktívny" },
  { value: "inactive", label: "Neaktívny" },
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

function SectionHeading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 border-b border-gray-100 pb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
      {icon}
      {children}
    </h2>
  );
}

export function MemberForm({
  member,
  action,
  onCancel,
  onSuccess,
}: {
  member?: Member | null;
  action: (prev: ActionState | null, formData: FormData) => Promise<ActionState>;
  onCancel?: () => void;
  onSuccess?: (memberId: string) => void;
}) {
  const initial = member ? memberToFormValues(member) : null;
  const [category, setCategory] = useState<MembershipType>(
    initial?.membership_type ?? "adult",
  );
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);

  const showGuardian = requiresGuardian(category);
  // Pri zmene mládež→dospelý sa existujúce väzby zástupcov NEodstraňujú automaticky.
  const switchedToAdultWithoutRemoval =
    Boolean(member) &&
    isYouthCategory(member?.membership_type) &&
    !showGuardian;

  useEffect(() => {
    if (state?.ok && state.memberId && onSuccess) onSuccess(state.memberId);
  }, [state, onSuccess]);

  useEffect(() => {
    if (state?.ok) {
      // po úspešnom uložení netreba hlásiť neuložené zmeny
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDirty(false);
    }
  }, [state]);

  // Upozornenie pred opustením/obnovením stránky s nedokončeným formulárom.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const errors = !state || state.ok ? {} : state.errors;

  function handleCancel() {
    if (dirty) {
      setConfirmLeave(true);
      return;
    }
    onCancel?.();
  }

  return (
    <>
      <form
        action={formAction}
        onInput={() => setDirty(true)}
        className="space-y-6"
        noValidate
      >
        {state && !state.ok && state.message ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
            {state.message}
          </p>
        ) : null}
        {state?.ok ? (
          <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {member ? "Zmeny boli uložené." : "Člen bol pridaný."}
          </p>
        ) : null}

        {/* Sekcia A – Základné údaje */}
        <section className="space-y-4">
          <SectionHeading icon={<User className="h-4 w-4" />}>Základné údaje</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Meno" name="first_name" error={errors.first_name} required>
              <input id="first_name" name="first_name" defaultValue={initial?.first_name ?? ""} required className={inputCls} autoComplete="given-name" />
            </Field>
            <Field label="Priezvisko" name="last_name" error={errors.last_name} required>
              <input id="last_name" name="last_name" defaultValue={initial?.last_name ?? ""} required className={inputCls} autoComplete="family-name" />
            </Field>
          </div>
<div className="grid gap-4 sm:grid-cols-2">
            <Field label="Titul" name="title">
              <input id="title" name="title" defaultValue={initial?.title ?? ""} placeholder="Ing." className={inputCls} />
            </Field>
            <Field label="Registračné číslo" name="member_number" error={errors.member_number} required>
              <input
                id="member_number"
                name="member_number"
                defaultValue={initial?.member_number ?? ""}
                required
                disabled={Boolean(member)}
                className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kategória člena" name="membership_type" error={errors.membership_type} required>
              <select
                id="membership_type"
                name="membership_type"
                required
                defaultValue={initial?.membership_type ?? "adult"}
                onChange={(e) => setCategory(e.target.value as MembershipType)}
                className={inputCls}
              >
                {MEMBERSHIP_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dátum narodenia" name="birth_date" error={errors.birth_date}>
              <input
                id="birth_date"
                name="birth_date"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                defaultValue={initial?.birth_date ?? ""}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hodnosť" name="rank" error={errors.rank}>
              <input
                id="rank"
                name="rank"
                defaultValue={initial?.rank ?? ""}
                placeholder="hasič, starší hasič, veliteľ družstva…"
                maxLength={100}
                className={inputCls}
                autoComplete="off"
              />
            </Field>
            <Field label="Zaradenie v jednotke" name="position" error={errors.position}>
              <input
                id="position"
                name="position"
                defaultValue={initial?.position ?? ""}
                placeholder="strojník, vodič, rozvádzač, člen výboru…"
                maxLength={100}
                className={inputCls}
                autoComplete="off"
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="is_committee_member"
              defaultChecked={initial?.is_committee_member ?? false}
              className="h-5 w-5 rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]"
            />
            Člen výboru DHZ
          </label>
        </section>

        {/* Sekcia B – Kontaktné údaje */}
        <section className="space-y-4">
          <SectionHeading icon={<Contact className="h-4 w-4" />}>Kontaktné údaje</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telefón" name="phone" error={errors.phone}>
              <input id="phone" name="phone" type="tel" defaultValue={initial?.phone ?? ""} placeholder="+421 9xx xxx xxx" className={inputCls} autoComplete="tel" />
            </Field>
            <Field label="Email" name="email" error={errors.email}>
              <input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} className={inputCls} autoComplete="email" />
            </Field>
          </div>
          <Field label="Adresa" name="address">
            <input id="address" name="address" defaultValue={initial?.address ?? ""} className={inputCls} autoComplete="street-address" />
          </Field>
        </section>
{/* Sekcia D – Interné údaje */}
        <section className="space-y-4">
          <SectionHeading icon={<ShieldCheck className="h-4 w-4" />}>Interné údaje</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stav členstva" name="status" error={errors.status} required>
              <select id="status" name="status" required defaultValue={initial?.status ?? "active"} className={inputCls}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dátum vstupu" name="joined_at" error={errors.joined_at}>
              <input id="joined_at" name="joined_at" type="date" defaultValue={initial?.joined_at ?? ""} className={inputCls} />
            </Field>
          </div>
          <Field label="Interná poznámka" name="notes">
            <textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} rows={3} className={`${inputCls} min-h-[80px] resize-y`} />
          </Field>
        </section>

        {/* Sekcia C – Zákonný zástupca */}
        <section className="space-y-4">
          <SectionHeading icon={<UserRound className="h-4 w-4" />}>
            Zákonný zástupca {showGuardian ? "(povinné pre mládež)" : ""}
          </SectionHeading>
          {switchedToAdultWithoutRemoval ? (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Zmenou kategórie na dospelého sa existujúce väzby zákonných zástupcov
              neodstraňujú automaticky. Spravujte ich v sekcii zástupcov nižšie.
            </p>
          ) : null}
          {!member ? (
            showGuardian ? (
              <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Meno zástupcu" name="guardian_name" error={errors.guardian_name} required>
                    <input id="guardian_name" name="guardian_name" className={inputCls} autoComplete="off" />
                  </Field>
                  <Field label="Vzťah" name="guardian_relationship" error={errors.guardian_relationship} required>
                    <input id="guardian_relationship" name="guardian_relationship" placeholder="matka / otec / zákonný zástupca" className={inputCls} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Telefón zástupcu" name="guardian_phone" error={errors.guardian_phone} required>
                    <input id="guardian_phone" name="guardian_phone" type="tel" className={inputCls} />
                  </Field>
                  <Field label="Email zástupcu" name="guardian_email" error={errors.guardian_email}>
                    <input id="guardian_email" name="guardian_email" type="email" className={inputCls} />
                  </Field>
                </div>
              </div>
            ) : null
          ) : (
            <p className="text-sm text-gray-600">
              Zástupcov existujúceho člena spravujte v sekcii „Zákonní zástupcovia“
              na stránke úpravy člena.
            </p>
          )}
        </section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleCancel}
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
            {pending ? "Ukladám…" : member ? "Uložiť zmeny" : "Pridať člena"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmLeave}
        title="Opustiť formulár?"
        description="Máte neuložené zmeny. Naozaj chcete opustiť tento formulár?"
        confirmLabel="Opustiť"
        pending={false}
        onConfirm={() => {
          setConfirmLeave(false);
          setDirty(false);
          onCancel?.();
        }}
        onClose={() => setConfirmLeave(false)}
      />
    </>
  );
}