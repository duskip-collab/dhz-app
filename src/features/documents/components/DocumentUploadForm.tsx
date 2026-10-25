"use client";

import { useActionState, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import {
  uploadOrgDocumentAction,
  type OrgDocumentActionState,
} from "@/app/(app)/documents/actions";
import { ORG_DOCUMENT_CATEGORY_LABELS } from "@/lib/documents/org-documents.types";

const CATEGORIES = [
  { value: "MINUTES", label: ORG_DOCUMENT_CATEGORY_LABELS.MINUTES },
  { value: "STATUTE", label: ORG_DOCUMENT_CATEGORY_LABELS.STATUTE },
  { value: "REPORT", label: ORG_DOCUMENT_CATEGORY_LABELS.REPORT },
  { value: "FINANCE", label: ORG_DOCUMENT_CATEGORY_LABELS.FINANCE },
  { value: "OTHER", label: ORG_DOCUMENT_CATEGORY_LABELS.OTHER },
] as const;

/**
 * DocumentUploadForm – nahratie dokumentu (PDF/Word/Excel) s kategóriou.
 * Predvolená kategória je MINUTES (Zápisnica z porady).
 */
export function DocumentUploadForm({ defaultCategory = "MINUTES" }: { defaultCategory?: string }) {
  const [state, formAction, pending] = useActionState(
    uploadOrgDocumentAction,
    null as OrgDocumentActionState | null
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="doc-title" className="block text-sm font-semibold text-gray-700">
            Názov dokumentu
          </label>
          <input
            id="doc-title"
            name="title"
            required
            placeholder="napr. Zápisnica z porady 12. 10. 2026"
            className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
          {state && !state.ok && state.errors.title ? (
            <p role="alert" className="mt-1 text-xs text-[#C62828]">
              {state.errors.title}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="doc-category" className="block text-sm font-semibold text-gray-700">
            Kategória
          </label>
          <select
            id="doc-category"
            name="category"
            defaultValue={defaultCategory}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="doc-description" className="block text-sm font-semibold text-gray-700">
          Popis (nepovinné)
        </label>
        <textarea
          id="doc-description"
          name="description"
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
        />
      </div>

      <div>
        <label
          htmlFor="doc-file"
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
        >
          <FileUp className="h-4 w-4" />
          {fileName ?? "Vybrať súbor (PDF / Word / Excel)"}
        </label>
        <input
          ref={fileRef}
          id="doc-file"
          name="file"
          type="file"
          required
          accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setFileName(f ? f.name : null);
          }}
        />
        <p className="mt-1 text-xs text-gray-400">
          Word (.doc, .docx), Excel (.xls, .xlsx) alebo PDF, max. 25 MB.
        </p>
        {state && !state.ok && state.errors.file ? (
          <p role="alert" className="mt-1 text-xs text-[#C62828]">
            {state.errors.file}
          </p>
        ) : null}
      </div>

      {state && !state.ok && !state.errors.title && !state.errors.file ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
          {state.message}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Dokument bol nahraný.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C62828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        {pending ? "Nahrávam…" : "Nahrať dokument"}
      </button>
    </form>
  );
}
