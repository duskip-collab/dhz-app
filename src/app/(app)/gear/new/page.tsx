import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCategories } from "@/lib/equipment/equipment.service";
import { GearItemForm } from "@/features/equipment/components/GearItemForm";
import { createGearItemAction } from "../actions";

export default async function NewGearPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  const categories = await getCategories();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/gear"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
        >
          <ArrowLeft className="h-4 w-4" /> Späť na inventár
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nová položka inventára</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pridajte novú položku výstroja, techniky alebo vozidla.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {categories.length === 0 ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          Najprv vytvorte kategóriu —{" "}
          <Link href="/gear/categories" className="font-semibold underline">
            prejsť na kategórie
          </Link>
          .
        </div>
      ) : (
        <GearItemForm
          categories={categories}
          action={createGearItemAction}
          submitLabel="Vytvoriť položku"
        />
      )}
    </div>
  );
}
