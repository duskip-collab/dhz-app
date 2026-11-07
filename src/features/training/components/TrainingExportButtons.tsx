"use client";

import { useCallback, useState } from "react";
import { Download, Printer } from "lucide-react";
import { exportTrainingAttendanceAction } from "@/app/(app)/training/actions";
import type { TrainingExportData } from "@/lib/training/training.service";

const CSV_DELIMITER = ";";
const QUOTE = '"';

const STATUS_LABELS: Record<string, string> = {
  PRESENT: "Pr�tomn�",
  ABSENT: "Nepr�tomn�",
  EXCUSED: "Ospravedlnen�",
  LATE: "Oneskoren�",
};

const TARGET_GROUP_LABELS: Record<string, string> = {
  ALL: "V�etci",
  ADULT: "Dospel�",
  YOUTH: "Ml�de�",
  PREPARATORY: "Pr�pravn�",
  DORAST: "Dorast",
};

function isFormulaRisk(value: string): boolean {
  return /^[=+\-@]/.test(value);
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

function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (c) => {
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

function formatDateIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "�";
  return d.toISOString().slice(0, 10);
}

function formatTimeRange(startIso: string, endIso: string | null): string {
  const timeFmt = new Intl.DateTimeFormat("sk-SK", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "�";
  const startTime = timeFmt.format(start);
  const end = endIso ? new Date(endIso) : null;
  const endTime = end && !Number.isNaN(end.getTime()) ? timeFmt.format(end) : null;
  return endTime ? `${startTime} � ${endTime}` : startTime;
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
  const isNaNStart = Number.isNaN(start.getTime());

  const lines: string[] = [];
  const meta: [string, string][] = [
    ["N�zov tr�ningu", training.title],
    ["D�tum tr�ningu", isNaNStart ? "�" : dateFmt.format(start)],
    ["�as", formatTimeRange(training.start_time, training.end_time)],
    ["Miesto konania", training.location ?? "�"],
    ["Tr�ner", training.trainer ? `${training.trainer.first_name} ${training.trainer.last_name}` : "�"],
    ["Cie�ov� skupina", TARGET_GROUP_LABELS[training.target_group] ?? training.target_group],
    ["Celkov� po�et �lenov", String(rows.length)],
  ];
  for (const [key, value] of meta) {
    lines.push(`${escapeField(key)}${CSV_DELIMITER}${escapeField(value)}`);
  }
  lines.push("");
  lines.push(`Meno${CSV_DELIMITER}Priezvisko${CSV_DELIMITER}Stav doch�dzky${CSV_DELIMITER}Pozn�mka`);
  for (const r of rows) {
    lines.push([escapeField(r.first_name), escapeField(r.last_name), escapeField(STATUS_LABELS[r.status] ?? r.status), escapeField(r.note ?? "")].join(CSV_DELIMITER));
  }
  return lines.join("\n");
}

function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
  const timeStr = end ? `${timeFmt.format(start)} � ${timeFmt.format(end)}` : timeFmt.format(start);
  const trainerName = training.trainer ? `${training.trainer.first_name} ${training.trainer.last_name}` : "Neur�en� tr�ner";

  const present = rows.filter((r) => r.status === "PRESENT").length;
  const absent = rows.filter((r) => r.status === "ABSENT").length;
  const excused = rows.filter((r) => r.status === "EXCUSED").length;
  const late = rows.filter((r) => r.status === "LATE").length;

  const rowsHtml = rows
    .map(
      (r, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="name">${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</td>
      <td class="status">${escapeHtml(STATUS_LABELS[r.status] ?? r.status)}</td>
      <td class="sign"></td>
    </tr>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8">
<title>Prezen�n� listina � ${escapeHtml(training.title)}</title>
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
    <p class="org">DHZ RU�INDOL</p>
    <p class="doctitle">Prezen�n� listina</p>
  </div>
  <table class="meta">
    <tr><td class="k">N�zov tr�ningu:</td><td>${escapeHtml(training.title)}</td></tr>
    <tr><td class="k">D�tum:</td><td>${escapeHtml(dateFmt.format(start))}</td></tr>
    <tr><td class="k">�as:</td><td>${escapeHtml(timeStr)}</td></tr>
    <tr><td class="k">Miesto:</td><td>${escapeHtml(training.location ?? "�")}</td></tr>
    <tr><td class="k">Tr�ner:</td><td>${escapeHtml(trainerName)}</td></tr>
    <tr><td class="k">Cie�ov� skupina:</td><td>${escapeHtml(TARGET_GROUP_LABELS[training.target_group] ?? training.target_group)}</td></tr>
  </table>
  <table class="attendance">
    <thead>
      <tr><th class="num">�.</th><th>Meno a priezvisko</th><th class="status">Stav</th><th class="sign">Podpis</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <table class="summary">
    <tr><td class="k">Pr�tomn�:</td><td>${present}</td><td class="k">Nepr�tomn�:</td><td>${absent}</td></tr>
    <tr><td class="k">Ospravedlnen�:</td><td>${excused}</td><td class="k">Oneskoren�:</td><td>${late}</td></tr>
    <tr><td class="k">Celkov� po�et �lenov:</td><td>${rows.length}</td><td></td><td></td></tr>
  </table>
  <table class="signature">
    <tr>
      <td><div class="line"></div><div class="lbl">Podpis tr�nera</div></td>
      <td><div class="line"></div><div class="lbl">D�tum vyhotovenia</div></td>
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
      const res = await exportTrainingAttendanceAction(trainingId);
      if (!res.ok) {
        setError(res.error || "Export zlyhal.");
        return;
      }
      const csv = buildCsv(res.data);
      const date = formatDateIso(res.data.training.start_time);
      const fileName = `DHZ_Ruzindol_Prezencna_listina_${date}.csv`;
      downloadCsv(csv, fileName);
    } catch {
      setError("Chyba pri exporte CSV.");
    } finally {
      setLoading(false);
    }
  }, [trainingId]);

  const handlePrint = useCallback(async () => {
    setError(null);
    const printWin = window.open("", "_blank", "noopener,noreferrer,width=1050,height=1500");
    if (!printWin) {
      setError("Prehliada� blokuje vyskakovacie okno. Povolte vyskakovacie okna pre t�to str�nku a sk�ste to znova.");
      return;
    }
    printWin.document.write("<html><body style='font-family:sans-serif;padding:2rem'><p>Na��tavam prezen�n� listinu�</p></body></html>");
    try {
      setLoading(true);
      const res = await exportTrainingAttendanceAction(trainingId);
      if (!res.ok) {
        printWin.document.write(`<html><body style='font-family:sans-serif;padding:2rem'><p style='color:#c62828'>Chyba: ${escapeHtml(res.error)}</p></body></html>`);
        printWin.document.close();
        setLoading(false);
        return;
      }
      printWin.document.write(buildPrintHtml(res.data));
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        try { printWin.print(); } catch {}
        setLoading(false);
      }, 200);
      printWin.onafterprint = () => { try { printWin.close(); } catch {} };
    } catch {
      setError("Chyba pri na��tan� �dajov na tla�.");
      setLoading(false);
      try { printWin.close(); } catch {}
    }
  }, [trainingId]);

  return (
    <section className="flex flex-wrap gap-3 items-center">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleExportCsv}
        disabled={loading}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-60 disabled:pointer-events-none"
      >
        <Download className="h-4 w-4" /> Exportova� CSV
      </button>

      <button
        type="button"
        onClick={handlePrint}
        disabled={loading}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-gray-800 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:opacity-60 disabled:pointer-events-none"
      >
        <Printer className="h-4 w-4" /> Vytla�i� prezen�n� listinu
      </button>

      {loading ? (
        <span className="text-xs text-gray-500">Spracov�vanie�</span>
      ) : null}
    </section>
  );
}
