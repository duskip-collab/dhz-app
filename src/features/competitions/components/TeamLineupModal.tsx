"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type {
  CompetitionTeamDetail,
  LineupMember,
} from "@/lib/competitions/competition.service";
import type { Member } from "@/lib/members/members.service";
import {
  saveTeamWithLineupAction,
  type CompetitionActionState,
} from "@/app/(app)/competitions/actions";

// Posty požiarneho útoku / disciplíny.
const POSITIONS = [
  "Koš",
  "Savič",
  "Strojník",
  "Béčka",
  "Rozdeľovač",
  "Ľavý terč",
  "Pravý terč",
  "Náhradník",
];

interface DraftLine {
  key: string;
  member_id: string;
  position: string;
}

function memberLabel(m: LineupMember | Member): string {
  return `${m.first_name} ${m.last_name} (${m.member_number})`;
}

function initialDraft(team: CompetitionTeamDetail | null): DraftLine[] {
  if (!team) {
    return [{ key: "0", member_id: "", position: "Koš" }];
  }
  if (team.lineup.length === 0) {
    return [{ key: "0", member_id: "", position: "Koš" }];
  }
  return team.lineup.map((l, i) => ({
    key: `${i}`,
    member_id: l.member_id,
    position: l.position,
  }));
}

export function TeamLineupModal({
  competitionId,
  team,
  members,
  onClose,
}: {
  competitionId: string;
  team: CompetitionTeamDetail | null;
  members: Member[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(team?.name ?? "");
  const [resultTime, setResultTime] = useState(team?.result_time?.toString() ?? "");
  const [resultPoints, setResultPoints] = useState(team?.result_points?.toString() ?? "");
  const [rank, setRank] = useState(team?.rank?.toString() ?? "");
  const [note, setNote] = useState(team?.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() => initialDraft(team));

  const [state, formAction, pending] = useActionState(
    saveTeamWithLineupAction.bind(null, competitionId, team?.id ?? null) as (
      prev: CompetitionActionState | null,
      formData: FormData
    ) => Promise<CompetitionActionState>,
    null
  );

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  const errors = !state || state.ok ? {} : state.errors;

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: `${Date.now()}-${prev.length}`, member_id: "", position: "Koš" },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  const validLines = lines.filter((l) => l.member_id !== "");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={team ? "Upraviť zloženie tímu" : "Pridať tím"}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {team ? "Upraviť zloženie tímu" : "Pridať tím"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            Zavrieť
          </button>
        </div>

        <form action={formAction} className="space-y-5">
          {state && !state.ok && state.message ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
              {state.message}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700">
                Názov tímu <span aria-hidden className="text-[#C62828]">*</span>
              </label>
              <input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="DHZ – Muži A"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[48px]"
              />
              {errors.name ? (
                <p role="alert" className="mt-1 text-xs text-[#C62828]">{errors.name}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="rank" className="mb-1.5 block text-sm font-medium text-gray-700">
                Umiestnenie (rank)
              </label>
              <input
                id="rank"
                name="rank"
                type="number"
                min={1}
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[48px]"
              />
            </div>
          </div>


          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="result_time" className="mb-1.5 block text-sm font-medium text-gray-700">
                Výsledný čas (s)
              </label>
              <input
                id="result_time"
                name="result_time"
                type="number"
                step="0.01"
                min={0}
                value={resultTime}
                onChange={(e) => setResultTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[48px]"
              />
            </div>
            <div>
              <label htmlFor="result_points" className="mb-1.5 block text-sm font-medium text-gray-700">
                Body
              </label>
              <input
                id="result_points"
                name="result_points"
                type="number"
                step="1"
                value={resultPoints}
                onChange={(e) => setResultPoints(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[48px]"
              />
            </div>
            <div>
              <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-gray-700">
                Poznámka
              </label>
              <input
                id="note"
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[48px]"
              />
            </div>
          </div>

          <fieldset className="space-y-3 rounded-xl border border-gray-200 p-4">
            <legend className="px-2 text-sm font-bold text-gray-900">Súpiska (posty)</legend>
            {lines.map((line) => (
              <div key={line.key} className="flex flex-wrap items-center gap-2">
                <select
                  value={line.member_id}
                  onChange={(e) => updateLine(line.key, { member_id: e.target.value })}
                  aria-label="Člen"
                  className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[44px]"
                >
                  <option value="">— Vybrať člena —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {memberLabel(m)}
                    </option>
                  ))}
                </select>
                <select
                  value={line.position}
                  onChange={(e) => updateLine(line.key, { position: e.target.value })}
                  aria-label="Post"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C62828] min-h-[44px]"
                >
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  disabled={lines.length <= 1}
                  aria-label="Odstrániť riadok"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-red-200 hover:text-[#C62828] disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {line.member_id !== "" ? (
                  <>
                    <input type="hidden" name="member_id" value={line.member_id} />
                    <input type="hidden" name="position" value={line.position} />
                  </>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              onClick={addLine}
              className="min-h-[44px] rounded-lg border border-dashed border-gray-300 px-4 text-sm font-semibold text-gray-600 transition hover:border-[#C62828] hover:text-[#C62828]"
            >
              + Pridať člena do súpisky
            </button>
            <p className="text-xs text-gray-400">
              Priradených: <span className="font-semibold tabular-nums">{validLines.length}</span>
            </p>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
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
              {pending ? "Ukladám…" : "Uložiť tím a súpisku"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

