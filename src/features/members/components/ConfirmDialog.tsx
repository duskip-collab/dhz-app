"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Zrušiť",
  pending,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-[#C62828]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 id="confirm-title" className="text-base font-bold text-gray-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-gray-600">{description}</p>
          </div>
        </div>
        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#C62828]">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-[48px] rounded-lg border border-gray-200 px-5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="min-h-[48px] rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50"
          >
            {pending ? "Spracúvam…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
