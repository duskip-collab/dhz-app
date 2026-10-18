import { Tag } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getCategories } from "@/lib/equipment/equipment.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { createCategoryAction, deleteCategoryAction } from "../actions";

export default async function GearCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const params = await searchParams;
  const str = (v: string | string[] | undefined): string | undefined =>
    typeof v === "string" ? v : undefined;

  const categories = await getCategories();
  const canManage = hasPermission(ctx.permissions, PERMISSIONS.INVENTORY_MANAGE);
  const error = str(params.error);
  const success = str(params.success);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            <Tag className="h-4 w-4" /> Technika a majetok
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Kategórie výstroja</h1>
          <p className="mt-1 text-sm text-gray-500">
            Spravujte kategórie, do ktorých patria položky inventára.
          </p>
        </div>
        <Link href="/gear" className="text-sm text-gray-600 hover:text-[#C62828]">
          ← Späť na inventár
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {success}
        </div>
      )}

      {canManage && (
        <form
          action={createCategoryAction}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
        >
          <h2 className="text-base font-bold text-gray-900 mb-4">Nová kategória</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cat-name" className="block text-sm font-medium text-gray-700 mb-1">
                Názov *
              </label>
              <input
                id="cat-name"
                name="name"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
                placeholder="Napr. Helmy"
              />
            </div>
            <div>
              <label htmlFor="cat-code" className="block text-sm font-medium text-gray-700 mb-1">
                Kód *
              </label>
              <input
                id="cat-code"
                name="code"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] uppercase"
                placeholder="Napr. HELMETS"
              />
            </div>
            <div>
              <label htmlFor="cat-desc" className="block text-sm font-medium text-gray-700 mb-1">
                Popis
              </label>
              <input
                id="cat-desc"
                name="description"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
                placeholder="Voliteľný popis"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="requires_inspection"
                className="rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]"
              />
              Vyžaduje pravidelnú kontrolu
            </label>
            <Button type="submit" variant="primary" size="sm">Pridať kategóriu</Button>
          </div>
        </form>
      )}

      {categories.length === 0 ? (
        <EmptyState
          title="Žiadne kategórie"
          description="Pridajte prvú kategóriu pre lepšiu evidenciu majetku."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div key={cat.id} className="border rounded-xl bg-white p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-lg font-semibold text-gray-900">{cat.name}</h2>
                <Badge tone="gray">{cat.code}</Badge>
              </div>
              {cat.description && (
                <p className="text-sm text-gray-600 mb-3">{cat.description}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {cat.requires_inspection && (
                  <span className="text-orange-600">📅 Vyžaduje kontrolu</span>
                )}
              </div>
              {canManage && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                  <form action={deleteCategoryAction} className="inline">
                    <input type="hidden" name="category_id" value={cat.id} />
                    <Button type="submit" variant="danger" size="sm">Vymazať</Button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
