"use client";

import { useState } from "react";
import { Download, FileText, Trash2 } from "lucide-react";
import { deleteOrgDocumentAction } from "@/app/(app)/documents/actions";
import {
  ORG_DOCUMENT_CATEGORY_LABELS,
  type OrgDocument,
  type OrgDocumentCategory,
} from "@/lib/documents/org-documents.types";

function formatSize(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric" });
}

/**
 * DocumentList – zoznam dokumentov s ikonou formátu, stiahnutím a mazaním.
 * downloadUrl získané server-side: Map<documentId, signedUrl>.
 */
export function DocumentList({
  documents,
  downloadUrls,
  canUpload,
}: {
  documents: OrgDocument[];
  downloadUrls: Record<string, string>;
  canUpload: boolean;
}) {
  const [filter, setFilter] = useState<"ALL" | OrgDocumentCategory>("ALL");

  const list = filter === "ALL" ? documents : documents.filter((d) => d.category === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
            filter === "ALL" ? "bg-[#C62828] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Všetky
        </button>
        {(Object.keys(ORG_DOCUMENT_CATEGORY_LABELS) as OrgDocumentCategory[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              filter === c ? "bg-[#C62828] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {ORG_DOCUMENT_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          V tejto kategórii zatiaľ nie sú žiadne dokumenty.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((doc) => {
            const url = downloadUrls[doc.id];
            return (
              <li
                key={doc.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#C62828]">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{doc.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {ORG_DOCUMENT_CATEGORY_LABELS[doc.category]} · {doc.file_name} ·{" "}
                        {formatSize(doc.size_bytes)} · {formatDate(doc.created_at)}
                      </p>
                      {doc.description ? (
                        <p className="mt-1 text-sm text-gray-600">{doc.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:text-[#C62828]"
                      >
                        <Download className="h-4 w-4" /> Otvoriť
                      </a>
                    ) : null}
                    {canUpload ? (
                      <form action={deleteOrgDocumentAction}>
                        <input type="hidden" name="document_id" value={doc.id} />
                        <button
                          type="submit"
                          aria-label={`Odstrániť dokument ${doc.title}`}
                          className="inline-flex min-h-[40px] w-10 items-center justify-center rounded-lg border border-red-200 text-[#C62828] transition hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
