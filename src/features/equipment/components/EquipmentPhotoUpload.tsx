"use client";

import { useActionState } from "react";
import { Camera, Loader2 } from "lucide-react";
import type { EquipmentActionState } from "@/app/(app)/inventory/actions";
import { ImageUploadField } from "@/components/ui/ImageUploadField";

/**
 * EquipmentPhotoUpload – nahrá fotografiu položky inventára.
 * Výber súboru a fotoaparátu zabezpečuje spoločné ImageUploadField.
 */
export function EquipmentPhotoUpload({
  action,
  currentPhotoUrl,
}: {
  action: (prev: EquipmentActionState | null, formData: FormData) => Promise<EquipmentActionState>;
  currentPhotoUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  const error = !state || state.ok ? undefined : state.errors.photo ?? state.message;

  return (
    <form action={formAction} className="space-y-3">
      <ImageUploadField
        name="photo"
        currentPhotoUrl={currentPhotoUrl}
        caption="JPG, PNG alebo WebP, max. 5 MB."
        disabled={pending}
      />
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
