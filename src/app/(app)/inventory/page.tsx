import { Images, Package, Wrench } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getCategories,
  getEquipmentItems,
  getExpiringEquipment,
  getInventoryAvailability,
} from "@/lib/equipment/equipment.service";
import { EquipmentStats } from "@/features/equipment/components/EquipmentStats";
import { EquipmentFilters } from "@/features/equipment/components/EquipmentFilters";
import { EquipmentList } from "@/features/equipment/components/EquipmentList";
import { NewEquipmentButton } from "@/features/equipment/components/NewEquipmentButton";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.INVENTORY_VIEW);

  const params = await searchParams;
  const str = (v: string | string[] | undefined): string | undefined =>
    typeof v === "string" ? v : undefined;

  const categoryId = str(params.category);
  const status = str(params.status);
  const search = str(params.q);
  const expiryOnly = str(params.expiry) === "1";

  const [categories, items, expiring, availability] = await Promise.all([
    getCategories(),
    getEquipmentItems({
      category_id: categoryId,
      status: status as never,
      search,
      expiry_warning: expiryOnly || undefined,
    }),
    getExpiringEquipment(30),
    getInventoryAvailability(),
  ]);

  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.INVENTORY_EDIT);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            <Package className="h-4 w-4" /> DHZ
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Inventár a technika</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
            <Wrench className="h-4 w-4" /> Prehľad majetku, výstroje a vozidiel hasičského zboru
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/gallery">
            <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C62828] focus-visible:outline-offset-2">
              <Images className="h-4 w-4" aria-hidden="true" />
              Zobraziť galériu
            </span>
          </Link>
          {canEdit ? <NewEquipmentButton categories={categories} /> : null}
        </div>
      </div>

      <EquipmentStats items={items} expiring={expiring} />

      <EquipmentFilters categories={categories} resultCount={items.length} />

      <EquipmentList items={items} categories={categories} availability={availability} />
    </div>
  );
}
