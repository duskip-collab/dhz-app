import { Shirt } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getCategories,
  getEquipmentItems,
  getExpiringEquipment,
  getInventoryAvailability,
  type EquipmentItem,
  type EquipmentCategory,
} from "@/lib/equipment/equipment.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

const STATUS_LABELS: Record<
  EquipmentItem["status"],
  { label: string; tone: "green" | "blue" | "yellow" | "red" | "gray" }
> = {
  AVAILABLE: { label: "Dostupné", tone: "green" },
  IN_SERVICE: { label: "V službe", tone: "blue" },
  RESERVED: { label: "Rezervované", tone: "yellow" },
  DAMAGED: { label: "Poškodené", tone: "red" },
  DISPOSED: { label: "Vyradené", tone: "gray" },
};

const CONDITION_LABELS: Record<EquipmentItem["condition"], string> = {
  NEW: "Nové",
  GOOD: "Dobré",
  FAIR: "Použité",
  POOR: "Opotrebované",
  UNSERVICEABLE: "Neschopné služby",
};

function categoryName(categories: EquipmentCategory[], id: string): string {
  return categories.find((c) => c.id === id)?.name ?? "—";
}

export default async function GearPage({
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

  const [categories, items, expiring, availability] = await Promise.all([
    getCategories(),
    getEquipmentItems({ category_id: categoryId, status: status as never, search }),
    getExpiringEquipment(30),
    getInventoryAvailability(),
  ]);

  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.INVENTORY_EDIT);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            <Shirt className="h-4 w-4" /> Výstroj a technika
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Technika a majetok</h1>
          <p className="mt-1 text-sm text-gray-500">
            Prehľad výstroje, techniky a majetku hasičského zboru
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/gear/categories">
            <Button variant="secondary" size="sm">Kategórie</Button>
          </Link>
          <Link href="/gear/assignments">
            <Button variant="secondary" size="sm">Priradenia</Button>
          </Link>
          {canEdit && (
            <Link href="/gear/new">
              <Button variant="primary" size="sm">+ Nová položka</Button>
            </Link>
          )}
        </div>
      </div>

      {expiring.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm font-semibold text-yellow-800">
            ⚠️ {expiring.length} položiek má blížiaci sa termín kontroly/STK/EK
          </p>
          <ul className="mt-2 space-y-1 text-sm text-yellow-700">
            {expiring.slice(0, 5).map((item) => (
              <li key={item.id}>
                <Link href={`/gear/${item.id}`} className="hover:underline">
                  {item.name}
                  {item.next_inspection_date
                    ? ` — do ${new Date(item.next_inspection_date).toLocaleDateString("sk-SK")}`
                    : ""}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form method="get" className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="q" className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Hľadať
            </label>
            <input
              id="q"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Názov, inv. číslo, sér. číslo…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            />
          </div>
          <div>
            <label htmlFor="category" className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Kategória
            </label>
            <select
              id="category"
              name="category"
              defaultValue={categoryId ?? ""}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white"
            >
              <option value="">Všetky kategórie</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Stav
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status ?? ""}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white"
            >
              <option value="">Všetky stavy</option>
              {Object.entries(STATUS_LABELS).map(([value, cfg]) => (
                <option key={value} value={value}>{cfg.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button type="submit" variant="secondary" size="sm">Filtrovať</Button>
          <Link href="/gear" className="text-sm text-gray-500 hover:text-[#C62828]">
            Zrušiť filtre
          </Link>
          <span className="ml-auto text-xs text-gray-400">{items.length} položiek</span>
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState
          title="Žiadne položky v inventári"
          description="Upravte filtre alebo pridajte prvú položku výstroja či techniky."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th scope="col" className="px-4 py-3 font-semibold">Názov</th>
                <th scope="col" className="px-4 py-3 font-semibold">Kategória</th>
                <th scope="col" className="px-4 py-3 font-semibold">Inv. číslo</th>
                <th scope="col" className="px-4 py-3 font-semibold">Umiestnenie</th>
                <th scope="col" className="px-4 py-3 font-semibold">Stav</th>
                <th scope="col" className="px-4 py-3 font-semibold">Opotreb.</th>
                <th scope="col" className="px-4 py-3 font-semibold">Kusy</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const statusCfg = STATUS_LABELS[item.status] ?? {
                  label: item.status,
                  tone: "gray" as const,
                };
                return (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/gear/${item.id}`}
                        className="font-medium text-gray-900 hover:text-[#C62828]"
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {categoryName(categories, item.category_id)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.inventory_number ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{item.location ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {CONDITION_LABELS[item.condition] ?? item.condition}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {(() => {
                        const av = availability[item.id];
                        const total = av?.total ?? item.quantity ?? 1;
                        const available = av?.available ?? total;
                        const assigned = av?.assigned ?? 0;
                        return (
                          <span className="tabular-nums">
                            {total}
                            <span className="block text-xs text-gray-400">
                              {available} dostupných · {assigned} pridelených
                            </span>
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

