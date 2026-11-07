"use client";

import { useCallback, useState } from "react";
import { Download, Print } from "lucide-react";
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
        "&": "&",
        "<": "<",
        ">": ">",
        '"': """,
        "'": "'",
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
    s.includes(CSV_DELIMITER) || s.includes(QUOTE) || s.includes("\\n") || s.includes("\\r");
  if (needsQuote) {
    s = QUOTE + s.replace(/"/g, QUOTE + QUOTE) + QUOTE;
  }
  return s;
}

function formatDateSk(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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