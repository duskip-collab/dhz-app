"use client";

import { useActionState, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import type { ActionState } from "@/app/(app)/members/actions";

export function MemberPhotoUpload({
  action,
  currentPhotoUrl,
}: {
  action: (prev: ActionState | null, formData: FormData) => Promise<ActionState>;
  currentPhotoUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const error = !state || state.ok ? undefined : state.errors.photo ?? state.message;

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-center gap-4">
        {preview || currentPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview ?? currentPhotoUrl ?? ""}
            alt="Fotografia člena"
            className="h-20 w-20 rounded-full border border-gray-200 object-cover"
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#C62828]/10 text-[#C62828]">
            <Camera className="h-8 w-8" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <label
            htmlFor="member-photo"
            className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
          >
            Vybrať fotografiu
          </label>
          <input
            ref={fileRef}
            id="member-photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPreview(URL.createObjectURL(f));
              else setPreview(null);
            }}
          />
          <p className="mt-1 text-xs text-gray-400">JPG, PNG alebo WebP, max. 5 MB. Ukladá sa do súkromného úložiska.</p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-[#C62828]">
          {error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-xs text-green-700">
          Fotografia bola nahraná.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {pending ? "Nahrávam…" : "Nahrať fotografiu"}
      </button>
    </form>
  );
}
