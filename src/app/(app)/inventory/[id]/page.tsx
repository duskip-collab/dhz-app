import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getEquipmentById, getEquipmentPhotoUrls } from "@/lib/equipment/equipment.service";
import { deleteInventoryItemAction, uploadEquipmentPhotoAction } from "../actions";
import { listMembers, type Member } from "@/lib/members/members.service";
import { EquipmentDetailHeader } from "@/features/equipment/components/EquipmentDetailHeader";
import { VehicleDetailsCard } from "@/features/equipment/components/VehicleDetailsCard";
import { EquipmentAssignmentSection } from "@/features/equipment/components/EquipmentAssignmentSection";
import { EquipmentPhotoUpload } from "@/features/equipment/components/EquipmentPhotoUpload";
import { MaintenanceLogSection } from "@/features/equipment/components/MaintenanceLogSection";
import { PhotoGallery } from "@/components/ui/PhotoGallery";

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
  const canManage = hasPermission(ctx.permissions, PERMISSIONS.INVENTORY_MANAGE);

  // Fotografia položky (signed URL)
  let photoUrls: string[] = [];
  if (item.photo_path) {
    try {
      photoUrls = await getEquipmentPhotoUrls(item.id, item.photo_path);
    } catch {
      photoUrls = [];
    }
  }

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

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <PhotoGallery
          photos={photoUrls.map((src, index) => ({
            src,
            alt: `${item.name} – fotografia ${index + 1}`,
          }))}
          title="Fotografie položky"
        />
        {(canEdit || canManage) && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="mb-3 text-sm text-gray-500">
              Výber súboru z počítača alebo priame odfotenie mobilom.
            </p>
            <EquipmentPhotoUpload
              action={uploadEquipmentPhotoAction.bind(null, item.id)}
              currentPhotoUrl={photoUrls[0] ?? null}
            />
          </div>
        )}
      </section>

      {canManage && (
        <div className="rounded-2xl border border-red-100 bg-red-50/40 p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-red-700">
            Odstránenie položky
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Položka bude trvale vymazaná z inventára. Akcia je nevratná.
          </p>
          <form action={deleteInventoryItemAction} className="mt-3">
            <input type="hidden" name="equipment_id" value={item.id} />
            <button
              type="submit"
              className="min-h-[44px] rounded-lg border border-red-200 bg-white px-5 text-sm font-semibold text-[#C62828] shadow-sm transition hover:bg-red-50 focus:ring-2 focus:ring-[#C62828] focus:ring-offset-2"
            >
              Odstrániť položku
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
