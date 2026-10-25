"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteMemberAction } from "@/app/(app)/members/actions";

/**
 * DeleteMemberButton – trvalé vymazanie člena s potvrdzovacím modálnym oknom.
 * Vyžaduje oprávnenie members.delete (renderované podmienene rodičom).
 */
export function DeleteMemberButton({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-[#C62828] shadow-sm transition hover:bg-red-50 focus:ring-2 focus:ring-[#C62828] focus:ring-offset-2"
      >
        <Trash2 className="h-4 w-4" /> Zmazať člena
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Potvrdenie vymazania člena"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Vymazať člena?</h2>
            <p className="mt-2 text-sm text-gray-600">
              Člen <strong>{memberName}</strong> bude <strong>trvale vymazaný</strong> vrátane
              súvisiacich záznamov (kurzy, licencie, dokumenty, priradenia výstroja,
              dochádzka). Prihlasovací účet zostáva nedotknutý. Akcia je nevratná.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[44px] rounded-lg border border-gray-200 px-5 text-sm font-semibold text-gray-700 transition hover:border-gray-300"
              >
                Zrušiť
              </button>
              <form action={deleteMemberAction}>
                <input type="hidden" name="member_id" value={memberId} />
                <button
                  type="submit"
                  className="min-h-[44px] rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000]"
                >
                  Trvale vymazať
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
