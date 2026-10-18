import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCategories, getEquipmentById } from "@/lib/equipment/equipment.service";
import { GearItemForm } from "@/features/equipment/components/GearItemForm";
import { updateGearItemAction } from "../../actions";

export default async function EditGearPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;

  await requirePermission(PERMISSIONS.INVENTORY_EDIT);

  let item;
  try {
    item = await getEquipmentById(id);
  } catch (e) {
    if (typeof e === "object" && e !== null && "status" in e && (e as { status: number }).status === 404) {
      notFound();
    }
    throw e;
  }

  const categories = await getCategories();
  const boundAction = updateGearItemAction.bind(null, id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/gear/${item.id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
        >
          <ArrowLeft className="h-4 w-4" /> Späť na detail
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upraviť položku</h1>
        <p className="mt-1 text-sm text-gray-500">{item.name}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <GearItemForm
        categories={categories}
        item={item}
        vehicle={item.vehicle_details}
        action={boundAction}
        submitLabel="Uložiť zmeny"
      />
    </div>
  );
}
