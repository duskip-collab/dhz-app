"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Member } from "@/lib/members/members.service";
import type { EquipmentItem } from "@/lib/equipment/equipment.service";
import { IncidentFormModal } from "./IncidentFormModal";

export function NewIncidentView({
  members,
  equipment,
}: {
  members: Member[];
  equipment: EquipmentItem[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#C62828]">
          Zásahová činnosť
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Nový výjazd</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vyplňte údaje o zásahu, posádke a použitej technike.
        </p>
      </header>

      <Link
        href="/incidents"
        className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#C62828] transition hover:text-[#8E0000]"
      >
        <ArrowLeft className="h-4 w-4" /> Späť na zoznam výjazdov
      </Link>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <IncidentFormModal members={members} equipment={equipment} onClose={() => router.push("/incidents")} />
      </div>
    </div>
  );
}