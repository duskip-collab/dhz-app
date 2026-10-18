"use client";

import { useState } from "react";
import { ArrowLeft, Cake, CalendarDays, IdCard, MapPin, Mail, Phone, StickyNote } from "lucide-react";
import Link from "next/link";
import type { Member, MemberGuardian } from "@/lib/members/members.service";
import { MembershipBadge, MemberStatusBadge, ageFromBirthDate } from "./MemberBadges";
import { MemberActions } from "./MemberActions";
import { GuardianSection } from "./GuardianSection";
import { MemberPhotoUpload } from "./MemberPhotoUpload";
import { isYouthCategory } from "@/features/members/schemas/member.validation";
import {
  createGuardianAction,
  deleteGuardianAction,
  uploadMemberPhotoAction,
} from "@/app/(app)/members/actions";

type TabId = "overview" | "training" | "courses" | "equipment" | "documents";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Prehľad" },
  { id: "training", label: "Dochádzka / Tréningy" },
  { id: "courses", label: "Kurzy a školenia" },
  { id: "equipment", label: "Výstroj" },
  { id: "documents", label: "Dokumenty" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("sk-SK", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{note}</p>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-gray-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm text-gray-800">{value}</p>
      </div>
    </div>
  );
}
