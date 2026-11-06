"use client";

import { useActionState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import type { ActionState } from "@/app/(app)/members/actions";
import { ImageUploadField } from "@/components/ui/ImageUploadField";

export function MemberPhotoUpload({
  action,
  deleteAction,
  currentPhotoUrl,
  hasPhoto,
}: {
  action: (prev: ActionState | null, formData: FormData) => Promise<ActionState>;
  deleteAction: (prev: ActionState | null) => Promise<ActionState>;
  currentPhotoUrl: string | null;
  hasPhoto: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteAction, null);

  const error = [state, deleteState].find((result) => result && !result.ok);
  const success = [state, deleteState].find((result) => result?.ok);
  const busy = pending || deletePending;

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <ImageUploadField
          name="photo"
          currentPhotoUrl={currentPhotoUrl}
          caption="JPG, PNG alebo WebP, max. 5 MB. Ukladá sa do súkromného úložiska."
          disabled={busy}
          rounded
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {pending ? "Nahrávam…" : hasPhoto ? "Zmeniť fotografiu" : "Nahrať fotografiu"}
        </button>
      </form>
      {hasPhoto ? (
        <form action={deleteFormAction}>
          <button
            type="submit"
            disabled={busy}
            onClick={(event) => {
              if (!window.confirm("Naozaj chcete odstrániť fotografiu tohto člena?")) {
                event.preventDefault();
              }
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-[#C62828] transition hover:bg-red-50 disabled:opacity-50"
          >
            {deletePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deletePending ? "Odstraňujem…" : "Odstrániť fotografiu"}
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-[#C62828]">
          {!error.ok ? error.errors.photo ?? error.message : null}
        </p>
      ) : null}
      {success?.ok ? (
        <p role="status" className="text-xs text-green-700">
          {success.message ?? "Fotografia bola nahraná."}
        </p>
      ) : null}
    </div>
  );
}
