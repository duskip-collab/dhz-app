"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, Pencil, CheckCircle2, XCircle, Building2 } from "lucide-react";
import type { Competition } from "@/lib/competitions/competition.service";
import { CategoryBadge, CompetitionStatusBadge, LeagueBadge } from "./CompetitionBadges";
import { CompetitionForm } from "./CompetitionForm";
import { ConfirmDialog } from "@/features/members/components/ConfirmDialog";
import { updateCompetitionAction, changeCompetitionStatusAction } from "@/app/(app)/competitions/actions";

const dateFmt = new Intl.DateTimeFormat("sk-SK", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit" });

function formatRange(dateIso: string, endIso: string | null): string {
  const start = new Date(dateIso);
  if (Number.isNaN(start.getTime())) return "—";
  const startTime = timeFmt.format(start);
  const end = endIso ? new Date(endIso) : null;
  const endTime = end && !Number.isNaN(end.getTime()) ? ` – ${timeFmt.format(end)}` : "";
  return `${dateFmt.format(start)} · ${startTime}${endTime}`;
}

export function CompetitionHeader({
  competition,
  canEdit,
}: {
  competition: Competition;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStatus(next: "COMPLETED" | "CANCELLED") {
    setBusy(true);
    setError(null);
    try {
      const result = await changeCompetitionStatusAction(competition.id, next);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setConfirmCancel(false);
      setConfirmComplete(false);
      router.refresh();
    } catch {
      setError("Operácia zlyhala.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{competition.title}</h1>
            <LeagueBadge league={competition.league} />
          </div>
          {competition.description ? (
            <p className="mt-1 max-w-2xl text-sm text-gray-600">{competition.description}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <CompetitionStatusBadge status={competition.status} />
          <CategoryBadge category={competition.category} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          <CalendarClock className="h-4 w-4 text-gray-400" />
          <span className="tabular-nums">{formatRange(competition.date, competition.end_time)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-gray-400" />
          {competition.location ?? "Miesto neurčené"}
        </span>
        {competition.organizer ? (
          <span className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-gray-400" />
            {competition.organizer}
          </span>
        ) : null}
      </div>

      {canEdit ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" /> Upraviť súťaž
          </button>
          {competition.status === "PLANNED" ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmComplete(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-green-200 bg-white px-4 text-sm font-semibold text-green-700 transition hover:bg-green-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Dokončiť súťaž
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-[#C62828] transition hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" /> Zrušiť súťaž
              </button>
            </>
          ) : null}
          {error ? (
            <p role="alert" className="self-center text-sm text-[#C62828]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Upraviť súťaž"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Upraviť súťaž</h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                Zavrieť
              </button>
            </div>
            <CompetitionForm
              competition={competition}
              action={(prev, formData) => updateCompetitionAction(competition.id, prev, formData)}
              onCancel={() => setEditing(false)}
              onSuccess={() => {
                setEditing(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmCancel}
        title="Zrušiť súťaž?"
        description={`Súťaž „${competition.title}" bude označená ako zrušená. Údaje a tímy zostanú zachované.`}
        confirmLabel="Zrušiť súťaž"
        pending={busy}
        error={error}
        onConfirm={() => handleStatus("CANCELLED")}
        onClose={() => setConfirmCancel(false)}
      />

      <ConfirmDialog
        open={confirmComplete}
        title="Dokončiť súťaž?"
        description={`Súťaž „${competition.title}" bude označená ako dokončená.`}
        confirmLabel="Dokončiť"
        pending={busy}
        error={error}
        onConfirm={() => handleStatus("COMPLETED")}
        onClose={() => setConfirmComplete(false)}
      />
    </div>
  );
}

