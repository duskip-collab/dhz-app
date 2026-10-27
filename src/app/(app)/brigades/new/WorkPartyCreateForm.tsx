"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createWorkPartyAction } from "../actions";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className="bg-red-700 text-white px-4 py-2 rounded disabled:opacity-50">
      {pending ? "Ukladám…" : "Vytvoriť"}
    </button>
  );
}

export default function WorkPartyCreateForm() {
  const [state, formAction] = useActionState(createWorkPartyAction as any, null);
  const { pending } = useFormStatus();
  return (
    <form action={formAction} className="space-y-4">
      {(state as any)?.message && <p className="text-red-600">{(state as any).message}</p>}
      <input name="title" placeholder="Názov" required className="w-full border p-2 rounded" />
      <input name="work_date" type="datetime-local" required className="w-full border p-2 rounded" />
      <input name="duration_hours" type="number" step="0.5" placeholder="Dĺžka (h)" className="w-full border p-2 rounded" />
      <input name="location" placeholder="Miesto" className="w-full border p-2 rounded" />
      <select name="status" className="w-full border p-2 rounded">
        <option value="PLANNED">Plánovaná</option>
        <option value="IN_PROGRESS">Prebieha</option>
        <option value="COMPLETED">Dokončená</option>
        <option value="CANCELLED">Zrušená</option>
      </select>
      <textarea name="notes" placeholder="Poznámky" className="w-full border p-2 rounded" />
      <SubmitButton pending={pending} />
    </form>
  );
}