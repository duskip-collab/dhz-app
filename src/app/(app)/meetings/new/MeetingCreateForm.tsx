"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createMeetingAction } from "../actions";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className="bg-red-700 text-white px-4 py-2 rounded disabled:opacity-50">
      {pending ? "Ukladám…" : "Vytvoriť"}
    </button>
  );
}

export default function MeetingCreateForm() {
  const [state, formAction] = useActionState(createMeetingAction as any, null);
  const { pending } = useFormStatus();
  return (
    <form action={formAction} className="space-y-4">
      {(state as any)?.message && <p className="text-red-600">{(state as any).message}</p>}
      <input name="title" placeholder="Názov" required className="w-full border p-2 rounded" />
      <input name="scheduled_at" type="datetime-local" required className="w-full border p-2 rounded" />
      <input name="duration_minutes" type="number" placeholder="Dĺžka (min)" className="w-full border p-2 rounded" />
      <input name="location" placeholder="Miesto" className="w-full border p-2 rounded" />
      <select name="meeting_type" className="w-full border p-2 rounded">
        <option value="SCHEDULED">Plánovaná</option>
        <option value="EXTRAORDINARY">Mimoriadna</option>
        <option value="TRAINING">Tréningová</option>
        <option value="OTHER">Iná</option>
      </select>
      <textarea name="agenda" placeholder="Program" className="w-full border p-2 rounded" />
      <SubmitButton pending={pending} />
    </form>
  );
}