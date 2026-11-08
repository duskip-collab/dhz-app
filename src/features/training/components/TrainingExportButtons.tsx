"use client";

import { useCallback, useState } from "react";
import { Download, Printer } from "lucide-react";
import { exportTrainingAttendanceAction } from "@/app/(app)/training/actions";
import type { TrainingExportData } from "@/lib/training/training.service";

const CSV_DELIMITER = ";";
const QUOTE = '"';

const STATUS_LABELS: Record<string, string> = {
  PRESENT: "Prítonný",
  ABSENT: "Neprítonný",
  EXCUSED: "Ospravedlnený",
  LATE: "Oneskorený",
};

const TARGET_GROUP_LABELS: Record<string, string> = {
  ALL: "Všetci",
  ADULT: "Dospelí",
  YOUTH: "Mládež",
  PREPARATORY: "Prípravná",
  DORAST: "Dorast",
};

function isFormulaRisk(value: string): boolean {
  const trimmed = value.trim();
  return /^[=\+\-@]/.test(trimmed);
}

function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/[&<>"']/g, (c) => {
      const map: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[c] ?? c;
    });
}

function escapeField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (isFormulaRisk(s)) {
    s = "'" + s;
  }
  const needsQuote =
    s.includes(CSV_DELIMITER) || s.includes(QUOTE) || s.includes("\n") || s.includes("\r");
  if (needsQuote) {
    s = QUOTE + s.replace(/"/g, QUOTE + QUOTE) + QUOTE;
  }
  return s;
}

function formatDateIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function formatTimeRange(startIso: string, endIso: string | null): string {
  const timeFmt = new Intl.DateTimeFormat("sk-SK", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "—";
  const startTime = timeFmt.format(start);
  const end = endIso ? new Date(endIso) : null;
  const endTime = end && !Number.isNaN(end.getTime()) ? timeFmt.format(end) : null;
  return endTime ? `${startTime} – ${endTime}` : startTime;
}

function buildCsv(data: TrainingExportData): string {
  const { training, rows } = data;
  const dateFmt = new Intl.DateTimeFormat("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const start = new Date(training.start_time);
  const lines: string[] = [];
  const meta: [string, string][] = [
    ["Názov tréningu", training.title],
    ["Dátum tréningu", Number.isNaN(start.getTime()) ? "—" : dateFmt.format(start)],
    ["Čas", formatTimeRange(training.start_time, training.end_time)],
    ["Miesto konania", training.location ?? "—"],
    ["Tréner", training.trainer ? `${training.trainer.first_name} ${training.trainer.last_name}` : "—"],
    ["Cieľová skupina", TARGET_GROUP_LABELS[training.target_group] ?? training.target_group],
    ["Celkový počet členov", String(rows.length)],
  ];

  for (const [key, value] of meta) {
    lines.push(`${escapeField(key)}${CSV_DELIMITER}${escapeField(value)}`);
  }
  lines.push("");
  lines.push(`Meno${CSV_DELIMITER}Priezvisko${CSV_DELIMITER}Stav dochádzky${CSV_DELIMITER}Poznámka`);
  for (const row of rows) {
    lines.push(
      [
        escapeField(row.first_name),
        escapeField(row.last_name),
        escapeField(STATUS_LABELS[row.status] ?? row.status),
        escapeField(row.note),
      ].join(CSV_DELIMITER),
    );
  }
  return lines.join("\n");
}

function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildPrintHtml(data: TrainingExportData): string {
  const { training, rows } = data;
  const dateFmt = new Intl.DateTimeFormat("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit" });
  const start = new Date(training.start_time);
  const end = training.end_time ? new Date(training.end_time) : null;
  const dateStr = Number.isNaN(start.getTime()) ? "—" : dateFmt.format(start);
  const timeStr = Number.isNaN(start.getTime())
    ? "—"
    : end && !Number.isNaN(end.getTime())
      ? `${timeFmt.format(start)} – ${timeFmt.format(end)}`
      : timeFmt.format(start);
  const trainerName = training.trainer
    ? `${training.trainer.first_name} ${training.trainer.last_name}`
    : "Neurčený tréner";

  const present = rows.filter((row) => row.status === "PRESENT").length;
  const absent = rows.filter((row) => row.status === "ABSENT").length;
  const excused = rows.filter((row) => row.status === "EXCUSED").length;
  const late = rows.filter((row) => row.status === "LATE").length;

  const rowsHtml = rows
    .map(
      (row, index) => `
    <tr>
      <td class="num">${index + 1}</td>
      <td class="name">${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)}</td>
      <td class="status">${escapeHtml(STATUS_LABELS[row.status] ?? row.status)}</td>
      <td class="sign"></td>
    </tr>
  `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8">
<title>Prezenčná listina – ${escapeHtml(training.title)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; font-size: 10pt; color: #111; line-height: 1.4; margin: 0; }
  .letterhead { border-bottom: 3px solid #7f1d1d; padding-bottom: 10px; margin-bottom: 18px; }
  .org { font-size: 15pt; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #7f1d1d; margin: 0; }
  .doctitle { font-size: 12pt; font-weight: 700; text-transform: uppercase; margin: 4px 0 0 0; color: #111; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 9.5pt; }
  .meta td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid #e5e7eb; }
  .meta td.k { width: 30%; font-weight: 700; color: #374151; border-bottom: 1px solid #e5e7eb; }
  table.attendance { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 9.5pt; }
  table.attendance th { background: #f3f4f6; border: 1px solid #9ca3af; padding: 6px 4px; text-align: left; font-size: 9pt; }
  table.attendance td { border: 1px solid #9ca3af; padding: 6px 4px; }
  table.attendance td.num { width: 5%; text-align: center; }
  table.attendance td.sign { width: 28%; height: 36px; vertical-align: bottom; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .summary { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9pt; }
  .summary td { border: 1px solid #9ca3af; padding: 5px 8px; }
  .summary td.k { font-weight: 700; width: 33%; background: #f3f4f6; }
  .signature { margin-top: 30px; width: 100%; border-collapse: collapse; font-size: 9pt; }
  .signature td { padding: 10px 8px 4px 0; }
  .signature .line { border-bottom: 1px solid #111; height: 24px; }
  .signature .lbl { font-size: 8pt; color: #4b5563; padding-top: 2px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="letterhead">
    <p class="org">DHZ RUŽINDOL</p>
    <p class="doctitle">Prezenčná listina</p>
  </div>
  <table class="meta">
    <tr><td class="k">Názov tréningu:</td><td>${escapeHtml(training.title)}</td></tr>
    <tr><td class="k">Dátum:</td><td>${escapeHtml(dateStr)}</td></tr>
    <tr><td class="k">Čas:</td><td>${escapeHtml(timeStr)}</td></tr>
    <tr><td class="k">Miesto:</td><td>${escapeHtml(training.location ?? "—")}</td></tr>
    <tr><td class="k">Tréner:</td><td>${escapeHtml(trainerName)}</td></tr>
    <tr><td class="k">Cieľová skupina:</td><td>${escapeHtml(TARGET_GROUP_LABELS[training.target_group] ?? training.target_group)}</td></tr>
  </table>
  <table class="attendance">
    <thead>
      <tr><th class="num">Č.</th><th>Meno a priezvisko</th><th class="status">Stav</th><th class="sign">Podpis</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <table class="summary">
    <tr><td class="k">Prítomní:</td><td>${present}</td><td class="k">Neprítomní:</td><td>${absent}</td></tr>
    <tr><td class="k">Ospravedlnení:</td><td>${excused}</td><td class="k">Oneskorení:</td><td>${late}</td></tr>
    <tr><td class="k">Celkový počet členov:</td><td>${rows.length}</td><td></td><td></td></tr>
  </table>
  <table class="signature">
    <tr>
      <td><div class="line"></div><div class="lbl">Podpis trénera</div></td>
      <td><div class="line"></div><div class="lbl">Dátum vyhotovenia</div></td>
    </tr>
  </table>
</body>
</html>`;
}

interface TrainingExportButtonsProps {
  trainingId: string;
}

export function TrainingExportButtons({ trainingId }: TrainingExportButtonsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExportCsv = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await exportTrainingAttendanceAction(trainingId);
      if (!result.ok) {
        setError(result.error || "Export zlyhal.");
        return;
      }
      downloadCsv(
        buildCsv(result.data),
        `DHZ_Ruzindol_Prezencna_listina_${formatDateIso(result.data.training.start_time)}.csv`,
      );
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Chyba pri exporte CSV.");
    } finally {
      setLoading(false);
    }
  }, [trainingId]);

  const handlePrint = useCallback(async () => {
    setError(null);
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1050,height=1500");
    if (!printWindow) {
      setError("Prehliadač blokuje vyskakovacie okno. Povoľte vyskakovacie okná pre túto stránku a skúste to znova.");
      return;
    }

    printWindow.document.write(
      "<html><body style='font-family:sans-serif;padding:2rem'><p>Načítavam prezenčnú listinu…</p></body></html>",
    );
    setLoading(true);
    try {
      const result = await exportTrainingAttendanceAction(trainingId);
      if (!result.ok) {
        setError(result.error || "Export zlyhal.");
        printWindow.close();
        return;
      }
      printWindow.document.open();
      printWindow.document.write(buildPrintHtml(result.data));
      printWindow.document.close();
      printWindow.focus();
      printWindow.onafterprint = () => printWindow.close();
      window.setTimeout(() => printWindow.print(), 200);
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : "Chyba pri načítaní údajov na tlač.");
      printWindow.close();
    } finally {
      setLoading(false);
    }
  }, [trainingId]);

  return (
    <section className="flex flex-wrap items-center gap-3">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleExportCsv}
        disabled={loading}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:pointer-events-none disabled:opacity-60"
      >
        <Download className="h-4 w-4" /> Exportovať CSV
      </button>
      <button
        type="button"
        onClick={handlePrint}
        disabled={loading}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-gray-800 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:pointer-events-none disabled:opacity-60"
      >
        <Printer className="h-4 w-4" /> Vytlačiť prezenčnú listinu
      </button>
      {loading ? <span className="text-xs text-gray-500">Spracovávanie…</span> : null}
    </section>
  );
}