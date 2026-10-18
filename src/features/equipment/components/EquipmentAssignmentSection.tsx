"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound, Plus, Undo2 } from "lucide-react";
import type { EquipmentItemDetail } from "@/lib/equipment/equipment.service";
import type { Member } from "@/lib/members/members.service";
import { assignEquipmentAction, returnEquipmentAction } from "@/app/(app)/inventory/actions";
import { ConditionBadge } from "./EquipmentBadges";

const CONDITIONS = [
  { value: "NEW", label: "Nové" },
  { value: "GOOD", label: "Dobrý" },
  { value: "FAIR", label: "Uspokojivý" },
  { value: "POOR", label: "Zlý" },
  { value: "UNSERVICEABLE", label: "Nepoužiteľné" },
] as const;

const inputCls =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[44px]";

const dateFmt = new Intl.DateTimeFormat("sk-SK", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

function AssignModal({
  item,
  members,
  onClose,
}: {
  item: EquipmentItemDetail;
  members: Member[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(assignEquipmentAction, null);

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
      aria-label="Priradiť členovi"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">Priradiť členovi DHZ</h2>
        <form action={formAction} className="space-y-4">
          {state && !state.ok && state.message ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
              {state.message}
            </p>
          ) : null}
          <input type="hidden" name="equipment_id" value={item.id} />
          <div>
            <label htmlFor="member_id" className="mb-1.5 block text-sm font-medium text-gray-700">Člen</label>
            <select id="member_id" name="member_id" required defaultValue="" className={inputCls}>
              <option value="" disabled>— Vybrať člena —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name} ({m.member_number})
                </option>
              ))}
            </select>
            {errors.member_id ? (
              <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.member_id}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="condition_on_assign" className="mb-1.5 block text-sm font-medium text-gray-700">
              Stav pri odovzdaní
            </label>
            <select id="condition_on_assign" name="condition_on_assign" defaultValue={item.condition} className={inputCls}>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-gray-700">Poznámka</label>
            <input id="notes" name="notes" className={inputCls} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className="min-h-[44px] rounded-lg border border-gray-200 px-5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:opacity-50">
              Zrušiť
            </button>
            <button type="submit" disabled={pending} className="min-h-[44px] rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50">
              {pending ? "Priraďujem…" : "Priradiť"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReturnModal({
  item,
  onClose,
}: {
  item: EquipmentItemDetail;
  onClose: () => void;
}) {
  const router = useRouter();
  const assignment = item.current_assignment;
  const [state, formAction, pending] = useActionState(returnEquipmentAction, null);

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vrátiť do skladu"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">Vrátiť do skladu / výdajne</h2>
        <form action={formAction} className="space-y-4">
          {state && !state.ok && state.message ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
              {state.message}
            </p>
          ) : null}
          {assignment ? <input type="hidden" name="assignment_id" value={assignment.id} /> : null}
          <input type="hidden" name="equipment_id" value={item.id} />
          <div>
            <label htmlFor="condition_on_return" className="mb-1.5 block text-sm font-medium text-gray-700">
              Stav pri vrátení
            </label>
            <select id="condition_on_return" name="condition_on_return" defaultValue="GOOD" className={inputCls}>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-gray-700">Poznámka</label>
            <input id="notes" name="notes" className={inputCls} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className="min-h-[44px] rounded-lg border border-gray-200 px-5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:opacity-50">
              Zrušiť
            </button>
            <button type="submit" disabled={pending} className="min-h-[44px] rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50">
              {pending ? "Vraciam…" : "Vrátiť"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


export function EquipmentAssignmentSection({
  item,
  members,
  canEdit,
}: {
  item: EquipmentItemDetail;
  members: Member[];
  canEdit: boolean;
}) {
  const [assigning, setAssigning] = useState(false);
  const [returning, setReturning] = useState(false);
  const assignment = item.current_assignment;

  const memberName = assignment?.member
    ? `${assignment.member.first_name} ${assignment.member.last_name}`
    : null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <UserRound className="h-5 w-5 text-gray-400" /> Priradenie členovi
      </h2>

      {assignment && memberName ? (
        <div className="mt-4 space-y-2">
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
            <p className="text-sm font-semibold text-gray-900">{memberName}</p>
            {assignment.member?.member_number ? (
              <p className="text-xs text-gray-500">Č. člen: {assignment.member.member_number}</p>
            ) : null}
            <p className="mt-1 text-xs text-gray-500">
              Priradené: {formatDateTime(assignment.assigned_at)}
            </p>
            {assignment.condition_on_assign ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-500">Stav pri odovzdaní:</span>
                <ConditionBadge condition={assignment.condition_on_assign} />
              </div>
            ) : null}
            {assignment.notes ? (
              <p className="mt-1 text-xs text-gray-500">Poznámka: {assignment.notes}</p>
            ) : null}
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setReturning(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
            >
              <Undo2 className="h-4 w-4" /> Vrátiť do skladu / výdajne
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-gray-500">Položka je na sklade.</p>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setAssigning(true)}
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000]"
            >
              <Plus className="h-4 w-4" /> Priradiť členovi DHZ
            </button>
          ) : null}
        </div>
      )}

      {assigning ? (
        <AssignModal item={item} members={members} onClose={() => setAssigning(false)} />
      ) : null}
      {returning ? (
        <ReturnModal item={item} onClose={() => setReturning(false)} />
      ) : null}
    </section>
  );
}

