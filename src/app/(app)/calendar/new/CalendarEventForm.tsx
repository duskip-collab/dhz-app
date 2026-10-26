"use client";

import { useState, useTransition } from "react";
import { createCalendarEventAction } from "../actions";

export default function CalendarEventForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  function handleStartChange(value: string) {
    setStartAt(value);
    if (value) {
      const d = new Date(value);
      d.setDate(d.getDate() + 1);
      // datetime-local format
      const pad = (n: number) => String(n).padStart(2, "0");
      const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setEndAt(formatted);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createCalendarEventAction(formData);
      } catch (err) {
        if (typeof err === "object" && err !== null && "digest" in err) throw err;
        setError(err instanceof Error ? err.message : "Chyba pri odosielaní.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 bg-white p-6 rounded-lg border">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      <div>
        <label className="block text-sm font-medium">Názov</label>
        <input name="title" required className="mt-1 w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Typ</label>
        <select name="event_type" className="mt-1 w-full border rounded px-3 py-2">
          <option value="MEETING">Porada</option>
          <option value="TRAINING">Tréning</option>
          <option value="INCIDENT">Zásah</option>
          <option value="WORK_PARTY">Brigáda</option>
          <option value="OTHER">Iné</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Začiatok</label>
        <input name="start_at" type="datetime-local" required className="mt-1 w-full border rounded px-3 py-2" value={startAt} onChange={(e) => handleStartChange(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm font-medium">Koniec</label>
        <input name="end_at" type="datetime-local" required className="mt-1 w-full border rounded px-3 py-2" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm font-medium">Miesto</label>
        <input name="location" className="mt-1 w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Opis</label>
        <textarea name="description" className="mt-1 w-full border rounded px-3 py-2" />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-[#C62828] px-4 py-2 text-white font-semibold disabled:opacity-50">
        {pending ? "Ukladám…" : "Vytvoriť"}
      </button>
    </form>
  );
}