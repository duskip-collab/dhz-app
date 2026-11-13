"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { resetFinanceDataAction, type FinanceActionState } from "@/app/(app)/finance/actions";
import { Button } from "@/components/ui/Button";

export function ResetFinanceSection() {
  const [state, formAction, pending] = useActionState(
    resetFinanceDataAction,
    null as FinanceActionState | null,
  );
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const inputCls =
    "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]";

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/50 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-[#C62828]">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-gray-900">Správa financií – Administrácia</h2>
          <p className="mt-1 text-sm text-gray-600">
            Úplné vynulovanie pokladne a reset finančných údajov/záznamov na nulu. Táto akcia nastaví počiatočné zostatky účtov na 0 € a vymaže všetky transakcie, uzávierky a kontroly.
          </p>
          <div className="mt-4">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setConfirmText("");
                setShowModal(true);
              }}
            >
              Vynulovať pokladňu a resetovať dáta
            </Button>
          </div>
        </div>
      </div>

      {state && !state.ok && (
        <p role="alert" className="mt-4 rounded-lg bg-red-100 px-4 py-3 text-sm font-semibold text-[#C62828]">
          {state.message}
        </p>
      )}
      {state && state.ok && (
        <p role="status" className="mt-4 rounded-lg bg-green-100 px-4 py-3 text-sm font-semibold text-green-800">
          {state.message}
        </p>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-[#C62828]">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-bold text-gray-900">Potvrdenie vynulovania financií</h3>
            </div>
            <p className="text-sm text-gray-600">
              UPOZORNENIE: Táto operácia je nevratná. Všetky transakcie, pokladničné kontroly, uzávierky a prílohy budú odstránené a počiatočné zostatky účtov nastavené na 0,00 €.
            </p>
            <div>
              <label htmlFor="confirm-reset" className="block text-xs font-bold uppercase tracking-wide text-gray-700">
                Pre potvrdenie napíšte <span className="font-mono text-[#C62828]">VYNULOVAT</span>:
              </label>
              <input
                id="confirm-reset"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="VYNULOVAT"
                className={inputCls}
              />
            </div>

            <form
              action={async (formData) => {
                await formAction(formData);
                setShowModal(false);
              }}
              className="flex justify-end gap-3 pt-2"
            >
              <input type="hidden" name="confirm_text" value={confirmText} />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowModal(false)}
              >
                Zrušiť
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={confirmText !== "VYNULOVAT" || pending}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {pending ? "Vynulovávam…" : "Potvrdiť vynulovanie"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
