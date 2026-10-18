"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Save, Users } from "lucide-react";
import type { Member } from "@/lib/members/members.service";
import type {
  AttendanceStatus,
  AttendanceRecord,
} from "@/lib/training/training.service";
import { updateAttendanceAction, type TrainingActionState } from "@/app/(app)/training/actions";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; activeCls: string }[] = [
  { value: "PRESENT", label: "🟢 Prítomný", activeCls: "border-green-300 bg-green-50 text-green-700" },
  { value: "ABSENT", label: "🔴 Neprítomný", activeCls: "border-red-300 bg-red-50 text-[#C62828]" },
  { value: "EXCUSED", label: "🟡 Ospravedlnený", activeCls: "border-amber-300 bg-amber-50 text-amber-700" },
  { value: "LATE", label: "🟠 Meškanie", activeCls: "border-orange-300 bg-orange-50 text-orange-700" },
];

interface Entry {
  status: AttendanceStatus;
  note: string;
}

function buildInitial(members: Member[], attendance: AttendanceRecord[]): Record<string, Entry> {
  const map: Record<string, Entry> = {};
  for (const m of members) {
    const existing = attendance.find((a) => a.member_id === m.id);
    map[m.id] = {
      status: existing?.status ?? "ABSENT",
      note: existing?.note ?? "",
    };
  }
  return map;
}


export function AttendanceManager({
  trainingId,
  members,
  attendance,
  canEdit,
}: {
  trainingId: string;
  members: Member[];
  attendance: AttendanceRecord[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    buildInitial(members, attendance)
  );
  const [state, formAction, pending] = useActionState(
    updateAttendanceAction.bind(null, trainingId) as (
      prev: TrainingActionState | null,
      formData: FormData
    ) => Promise<TrainingActionState>,
    null
  );

  const presentCount = useMemo(
    () => Object.values(entries).filter((e) => e.status === "PRESENT").length,
    [entries]
  );

  function setStatus(memberId: string, status: AttendanceStatus) {
    setEntries((prev) => ({ ...prev, [memberId]: { ...prev[memberId], status } }));
  }

  function setNote(memberId: string, note: string) {
    setEntries((prev) => ({ ...prev, [memberId]: { ...prev[memberId], note } }));
  }

  function markAllPresent() {
    setEntries((prev) => {
      const next: Record<string, Entry> = {};
      for (const id of Object.keys(prev)) next[id] = { ...prev[id], status: "PRESENT" };
      return next;
    });
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Users className="h-5 w-5 text-gray-400" /> Evidencia dochádzky
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Prítomných: <span className="font-semibold tabular-nums text-gray-800">{presentCount}</span> z{" "}
            <span className="font-semibold tabular-nums">{members.length}</span>
          </p>
        </div>
        {canEdit && members.length > 0 ? (
          <button
            type="button"
            onClick={markAllPresent}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-green-200 bg-white px-4 text-sm font-semibold text-green-700 transition hover:bg-green-50"
          >
            <CheckCheck className="h-4 w-4" /> Označiť všetkých ako prítomných
          </button>
        ) : null}
      </div>

      {members.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          Pre túto cieľovú skupinu sa nenašli žiadni aktívni členovia.
        </p>
      ) : (
        <form
          action={formAction}
          className="mt-4"
          onSubmit={() => {
            window.setTimeout(() => router.refresh(), 0);
          }}
        >
          {state && !state.ok && state.message ? (
            <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
              {state.message}
            </p>
          ) : null}
          {state?.ok ? (
            <p role="status" className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Dochádzka bola uložená.
            </p>
          ) : null}

          <ul className="space-y-2">
            {members.map((m) => {
              const entry = entries[m.id];
              return (
                <li key={m.id} className="rounded-xl border border-gray-200 p-3">
                  <input type="hidden" name="member_id" value={m.id} />
                  <input type="hidden" name="status" value={entry.status} />
                  <input type="hidden" name="note" value={entry.note} />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900">
                      {m.first_name} {m.last_name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {STATUS_OPTIONS.map((opt) => {
                        const active = entry.status === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={!canEdit}
                            aria-pressed={active}
                            onClick={() => setStatus(m.id, opt.value)}
                            className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-semibold transition disabled:opacity-60 ${
                              active
                                ? opt.activeCls
                                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {canEdit ? (
                    <input
                      type="text"
                      value={entry.note}
                      onChange={(e) => setNote(m.id, e.target.value)}
                      placeholder="Poznámka (nepovinné)…"
                      aria-label={`Poznámka pre ${m.first_name} ${m.last_name}`}
                      className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
                    />
                  ) : entry.note ? (
                    <p className="mt-2 text-xs text-gray-500">Poznámka: {entry.note}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {canEdit ? (
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {pending ? "Ukladám…" : "Uložiť dochádzku"}
              </button>
            </div>
          ) : null}
        </form>
      )}
    </section>
  );
}

