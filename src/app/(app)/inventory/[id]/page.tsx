import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getEquipmentById } from "@/lib/equipment/equipment.service";
import { listMembers, type Member } from "@/lib/members/members.service";
import { EquipmentDetailHeader } from "@/features/equipment/components/EquipmentDetailHeader";
import { VehicleDetailsCard } from "@/features/equipment/components/VehicleDetailsCard";
import { EquipmentAssignmentSection } from "@/features/equipment/components/EquipmentAssignmentSection";
import { MaintenanceLogSection } from "@/features/equipment/components/MaintenanceLogSection";

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission(PERMISSIONS.INVENTORY_VIEW);

  let item: Awaited<ReturnType<typeof getEquipmentById>> | null = null;
  try {
    item = await getEquipmentById(id);
  } catch {
    item = null;
  }
  if (!item) notFound();

  // Aktívni členovia pre modal priradenia (K8).
  let members: Member[] = [];
  try {
    members = await listMembers({ status: "active" });
  } catch {
    members = [];
  }

  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.INVENTORY_EDIT);

  return (
    <div className="space-y-6">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-[#C62828]"
      >
        <ArrowLeft className="h-4 w-4" /> Späť na inventár
      </Link>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          <Package className="h-4 w-4" /> Položka inventára
        </p>
        <EquipmentDetailHeader item={item} canEdit={canEdit} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <VehicleDetailsCard item={item} />
        <EquipmentAssignmentSection
          item={item}
          members={members}
          canEdit={canEdit}
        />
      </div>

      <MaintenanceLogSection item={item} canEdit={canEdit} />
    </div>
  );
}
