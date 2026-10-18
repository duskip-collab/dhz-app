"use client";

import { useState } from "react";
import { Pencil, Plus, Timer, Medal, StickyNote, Users } from "lucide-react";
import type {
  CompetitionDetail,
  CompetitionTeamDetail,
} from "@/lib/competitions/competition.service";
import type { Member } from "@/lib/members/members.service";
import { TeamLineupModal } from "./TeamLineupModal";

function teamName(m: { first_name: string; last_name: string } | null): string {
  return m ? `${m.first_name} ${m.last_name}` : "—";
}

function TeamCard({
  team,
  canEdit,
  onEdit,
}: {
  team: CompetitionTeamDetail;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-base font-bold text-gray-900">{team.name}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            {team.result_time !== null ? (
              <span className="flex items-center gap-1.5 tabular-nums">
                <Timer className="h-4 w-4 text-gray-400" />
                {team.result_time} s
              </span>
            ) : null}
            {team.result_points !== null ? (
              <span className="tabular-nums">{team.result_points} b</span>
            ) : null}
            {team.rank !== null ? (
              <span className="flex items-center gap-1.5">
                <Medal className="h-4 w-4 text-gray-400" />
                {team.rank}. miesto
              </span>
            ) : null}
          </div>
          {team.note ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
              <StickyNote className="h-3.5 w-3.5 text-gray-400" />
              {team.note}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300"
          >
            <Pencil className="h-4 w-4" /> Upraviť zloženie
          </button>
        ) : null}
      </div>

      <div className="mt-3 border-t border-gray-50 pt-3">
        {team.lineup.length === 0 ? (
          <p className="text-sm text-gray-400">Zostava nie je vyplnená.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {team.lineup.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 text-gray-700">
                  <Users className="h-3.5 w-3.5 text-gray-400" />
                  {teamName(l.member)}
                </span>
                <span className="rounded-md bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {l.position}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function TeamsSection({
  competition,
  members,
  canEdit,
}: {
  competition: CompetitionDetail;
  members: Member[];
  canEdit: boolean;
}) {
  // null = zatvorené; "new" = nový tím; inak id tímu na úpravu.
  const [modal, setModal] = useState<string | null>(null);

  const editingTeam =
    modal && modal !== "new"
      ? competition.teams.find((t) => t.id === modal) ?? null
      : null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Súťažné tímy a súpisky DHZ</h2>
          <p className="mt-1 text-sm text-gray-500">
            Prihlásených tímov:{" "}
            <span className="font-semibold tabular-nums text-gray-800">{competition.teams.length}</span>
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setModal("new")}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000]"
          >
            <Plus className="h-4 w-4" /> Pridať tím
          </button>
        ) : null}
      </div>

      {competition.teams.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          Zatiaľ nie sú prihlásené žiadne tímy DHZ.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {competition.teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              canEdit={canEdit}
              onEdit={() => setModal(team.id)}
            />
          ))}
        </ul>
      )}

      {canEdit && modal !== null ? (
        <TeamLineupModal
          competitionId={competition.id}
          team={editingTeam}
          members={members}
          onClose={() => setModal(null)}
        />
      ) : null}
    </section>
  );
}

