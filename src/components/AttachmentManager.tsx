"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type {
  FinanceTransactionAttachmentRow,
  FinanceTransactionStatus,
} from "@/types/database.types";
import {
  deleteTransactionAttachment,
  getAttachmentDownloadUrl,
  loadTransactionAttachments,
  uploadTransactionAttachment,
} from "@/app/dashboard/finance/attachment-actions";
// Konstanty su v osobitnom module — modul s direktivou `"use server"` smie
// exportovat IBA async funkcie (next/dist/build/webpack/loaders/
// next-flight-loader/action-validate.js), takze odtialto sa nenacitavaju.
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
} from "@/app/dashboard/finance/attachment-constants";

export interface AttachmentManagerProps {
  transactionId: string;
  status: FinanceTransactionStatus;
  initial?: FinanceTransactionAttachmentRow[];
  title?: string;
}

function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("sk-SK");
}

function isImage(mime: string | null): boolean {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

export function AttachmentManager({
  transactionId,
  status,
  initial,
  title = "Prilohy",
}: AttachmentManagerProps) {
  const readOnly = status !== "DRAFT";
  const [items, setItems] = useState<FinanceTransactionAttachmentRow[]>(initial ?? []);
  const [loading, setLoading] = useState<boolean>(!initial);
  const [uploading, setUploading] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initial) return;
    let live = true;
    const load = async () => {
      try {
        const rows = await loadTransactionAttachments(transactionId);
        if (live) setItems(rows);
      } catch {
        if (live) setError("Nacitanie priloh zlyhalo.");
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [transactionId, initial]);

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = await loadTransactionAttachments(transactionId);
      setItems(rows);
    } catch {
      setError("Nacitanie priloh zlyhalo.");
    } finally {
      setLoading(false);
    }
  };

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFieldError(null);
    setError(null);
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      setFieldError("Povolene su PDF, JPG, PNG, WebP.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setFieldError("Maximalna velkost je 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadTransactionAttachment(transactionId, null, fd);
      if (!res.ok) {
        setFieldError(res.errors.file ?? res.message);
        return;
      }
      await refresh();
    } catch {
      setError("Nahravanie zlyhalo.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (id: string) => {
    setError(null);
    setBusyId(id);
    try {
      const res = await getAttachmentDownloadUrl(id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Naozaj vymazat prilohu?")) return;
    setError(null);
    setBusyId(id);
    try {
      const res = await deleteTransactionAttachment(id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setItems((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card
      title={title}
      subtitle={
        readOnly
          ? `Read-only — transakcia je ${status}, prilohy sa neda menit.`
          : "Doklady k transakcii (PDF, JPG, PNG, WebP, max 10 MB)."
      }
    >
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-gray-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Nacitavam prilohy…
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-sm text-gray-500">Zatial ziadne prilohy.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                {isImage(a.mime_type) ? (
                  <ImageIcon className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{a.file_name}</p>
                <p className="text-xs text-gray-500">
                  {fmtBytes(a.file_size_bytes)} · {fmtDate(a.uploaded_at)}
                </p>
              </div>
              <Badge tone={isImage(a.mime_type) ? "blue" : "gray"}>
                {a.mime_type === "application/pdf" ? "PDF" : a.mime_type ?? "subor"}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busyId === a.id}
                onClick={() => handleDownload(a.id)}
                aria-label={`Stiahnut ${a.file_name}`}
              >
                {busyId === a.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
              {!readOnly && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={busyId === a.id}
                  onClick={() => handleDelete(a.id)}
                  aria-label={`Vymazat ${a.file_name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePick}
            disabled={uploading}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Nahravam…" : "Nahrat prilohu"}
          </Button>
          {fieldError && <p className="mt-2 text-xs text-red-600">{fieldError}</p>}
        </div>
      )}
    </Card>
  );
}
