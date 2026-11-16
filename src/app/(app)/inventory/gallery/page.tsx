import Link from "next/link";
import { ArrowLeft, Images, Search } from "lucide-react";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getCategories,
  getEquipmentPhotoGalleryItems,
  getEquipmentPhotoUrls,
} from "@/lib/equipment/equipment.service";
import { InventoryPhotoGrid } from "@/features/equipment/components/InventoryPhotoGrid";

const PAGE_SIZE = 24;

function queryString(params: {
  q?: string;
  category?: string;
  page: number;
}): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  query.set("page", String(params.page));
  return `/inventory/gallery?${query.toString()}`;
}

export default async function InventoryGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const params = await searchParams;
  const firstString = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : undefined;
  const search = firstString(params.q)?.trim().slice(0, 100) ?? "";
  const categoryId = firstString(params.category) ?? "";
  const rawPage = Number(firstString(params.page) ?? "1");
  const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const [categories, result] = await Promise.all([
    getCategories(),
    getEquipmentPhotoGalleryItems({
      category_id: categoryId || undefined,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: (requestedPage - 1) * PAGE_SIZE,
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  if (requestedPage > pageCount) {
    redirect(queryString({ q: search, category: categoryId, page: pageCount }));
  }

  const entries = await Promise.all(
    result.items.map(async (item) => ({
      equipmentId: item.id,
      name: item.name,
      categoryName: categories.find((category) => category.id === item.category_id)?.name ?? "—",
      photos: await getEquipmentPhotoUrls(item.id, item.photo_path),
    }))
  );
  const items = entries.filter((item) => item.photos.length > 0);

  return (
    <div className="space-y-6">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-[#C62828]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Späť na Inventár a techniku
      </Link>

      <header>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          <Images className="h-4 w-4" aria-hidden="true" /> Inventár a technika
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Galéria skladových položiek</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fotografie položiek, ku ktorým máte prístup.
        </p>
      </header>

      <form
        method="get"
        action="/inventory/gallery"
        className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
      >
        <div>
          <label htmlFor="gallery-search" className="mb-1 block text-xs font-semibold text-gray-500">
            Názov položky
          </label>
          <input
            id="gallery-search"
            name="q"
            type="search"
            maxLength={100}
            defaultValue={search}
            placeholder="Hľadať podľa názvu…"
            className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-[#C62828] focus:outline-none focus:ring-2 focus:ring-[#C62828]/20"
          />
        </div>
        <div>
          <label htmlFor="gallery-category" className="mb-1 block text-xs font-semibold text-gray-500">
            Kategória
          </label>
          <select
            id="gallery-category"
            name="category"
            defaultValue={categoryId}
            className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-[#C62828] focus:outline-none focus:ring-2 focus:ring-[#C62828]/20"
          >
            <option value="">Všetky kategórie</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Hľadať
        </button>
        <Link
          href="/inventory/gallery"
          className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold text-gray-600 hover:bg-gray-100"
        >
          Zrušiť filtre
        </Link>
      </form>

      {items.length > 0 ? (
        <InventoryPhotoGrid items={items} />
      ) : (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500">
          {result.total === 0
            ? "Nenašli sa žiadne skladové položky s fotografiami."
            : "Na tejto stránke nie sú dostupné fotografie. Skúste obnoviť stránku alebo zmeniť filtre."}
        </p>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Stránkovanie galérie" className="flex items-center justify-center gap-4">
          {requestedPage > 1 ? (
            <Link
              href={queryString({ q: search, category: categoryId, page: requestedPage - 1 })}
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Predchádzajúca
            </Link>
          ) : null}
          <span className="text-sm text-gray-500" aria-live="polite">
            Strana {requestedPage} / {pageCount}
          </span>
          {requestedPage < pageCount ? (
            <Link
              href={queryString({ q: search, category: categoryId, page: requestedPage + 1 })}
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Ďalšia
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
