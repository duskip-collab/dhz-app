"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Archive, RotateCcw } from "lucide-react";
import type { Member } from "@/lib/members/members.service";
import { MemberForm } from "./MemberForm";
import { ConfirmDialog } from "./ConfirmDialog";
import { updateMemberAction, archiveMemberAction, reactivateMemberAction } from "@/app/(app)/members/actions";

export function MemberActions({
  member,
  canEdit,
}: {
  member: Member;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return null;

  const isActive = member.status === "active";

  async function handleArchive() {
    setBusy(true);
    setError(null);
    try {
      const result = isActive
        ? await archiveMemberAction(member.id)
        : await reactivateMemberAction(member.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setConfirmArchive(false);
      router.refresh();
    } catch {
      setError("Operácia zlyhala.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
        >
          <Pencil className="h-4 w-4" /> Upraviť člena
        </button>
        <button
          type="button"
          onClick={() => setConfirmArchive(true)}
          className={
            isActive
              ? "inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-[#C62828] transition hover:bg-red-50"
              : "inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-green-200 bg-white px-4 text-sm font-semibold text-green-700 transition hover:bg-green-50"
          }
        >
          {isActive ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
          {isActive ? "Deaktivovať člena" : "Reaktivovať člena"}
        </button>
        {error ? (
          <p role="alert" className="self-center text-sm text-[#C62828]">
            {error}
          </p>
        ) : null}
      </div>

      {editing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Upraviť člena"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Upraviť člena</h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                Zavrieť
              </button>
            </div>
            <MemberForm
              member={member}
              action={(prev, formData) => updateMemberAction(member.id, prev, formData)}
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
        open={confirmArchive}
        title={isActive ? "Deaktivovať člena?" : "Reaktivovať člena?"}
        description={
          isActive
            ? `Člen ${member.first_name} ${member.last_name} bude označený ako neaktívny. Údaje zostanú zachované.`
            : `Člen ${member.first_name} ${member.last_name} bude opäť aktívny.`
        }
        confirmLabel={isActive ? "Deaktivovať" : "Reaktivovať"}
        pending={busy}
        error={error}
        onConfirm={handleArchive}
        onClose={() => setConfirmArchive(false)}
      />
    </>
  );
}
