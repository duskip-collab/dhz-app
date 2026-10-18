import { Wrench } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getVehicles, getVehicleEquipment } from "@/lib/equipment/vehicles.service";
import { getEquipmentItems } from "@/lib/equipment/equipment.service";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  addVehicleEquipmentAction,
  removeVehicleEquipmentAction,
} from "./actions";

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white";

export default async function VehicleEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.VEHICLE_VIEW);
  const params = await searchParams;
  const vehicleId = typeof params.vehicle === "string" ? params.vehicle : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;
  const success = typeof params.success === "string" ? params.success : undefined;

  const [vehicles, allItems] = await Promise.all([getVehicles(), getEquipmentItems()]);
  const selected = vehicleId ? vehicles.find((v) => v.id === vehicleId) ?? null : null;
  const equipment = selected ? await getVehicleEquipment(selected.id) : [];
  const canManage = hasPermission(ctx.permissions, PERMISSIONS.VEHICLE_MANAGE);
  const assignedIds = new Set(equipment.map((e) => e.equipment_id));
  const freeItems = allItems.filter((i) => i.id !== selected?.id && !assignedIds.has(i.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            <Wrench className="h-4 w-4" /> Technika
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Výzbroj vozidiel</h1>
          <p className="mt-1 text-sm text-gray-500">
            Priraďovanie výstroja a náradia ku konkrétnym vozidlám.
          </p>
        </div>
        <Link href="/vehicles" className="text-sm text-gray-600 hover:text-[#C62828]">
          ← Späť na vozidlá
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

      <form method="get" className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label htmlFor="vehicle" className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Vyberte vozidlo
            </label>
            <select id="vehicle" name="vehicle" defaultValue={vehicleId ?? ""} className={inputCls}>
              <option value="">— vyberte —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.vehicle_details?.license_plate ? ` (${v.vehicle_details.license_plate})` : ""}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" size="sm">Zobraziť</Button>
        </div>
      </form>

      {!selected ? (
        <EmptyState
          title="Nevybrané vozidlo"
          description="Vyberte vozidlo zo zoznamu, aby sa zobrazila jeho výzbroj."
        />
      ) : (
        <>
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-900 mb-1">{selected.name}</h2>
            <p className="text-sm text-gray-500 mb-4">
              SPZ: {selected.vehicle_details?.license_plate ?? "—"} ·{" "}
              {equipment.length} položiek výzbroje
            </p>
            {equipment.length === 0 ? (
              <p className="text-sm text-gray-500">K vozidlu zatiaľ nie je priradená žiadna výzbroj.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {equipment.map((row) => (
                  <li key={row.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        <Link href={`/gear/${row.equipment_id}`} className="hover:text-[#C62828]">
                          {row.equipment?.name ?? "Neznáma položka"}
                        </Link>
                        {row.quantity > 1 && (
                          <span className="ml-2 text-xs text-gray-500">× {row.quantity}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {row.equipment?.inventory_number ?? "—"}
                        {row.placement ? ` · ${row.placement}` : ""}
                      </p>
                    </div>
                    {canManage && (
                      <form action={removeVehicleEquipmentAction} className="shrink-0">
                        <input type="hidden" name="row_id" value={row.id} />
                        <input type="hidden" name="vehicle_id" value={selected.id} />
                        <Button type="submit" variant="danger" size="sm">Odobrať</Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canManage && (
            <form
              action={addVehicleEquipmentAction}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
            >
              <h2 className="text-base font-bold text-gray-900 mb-4">Pridať výzbroj</h2>
              <input type="hidden" name="vehicle_id" value={selected.id} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ve-equipment" className="block text-sm font-medium text-gray-700 mb-1">
                    Vybavenie *
                  </label>
                  <select id="ve-equipment" name="equipment_id" required className={inputCls}>
                    <option value="" disabled>Vyberte položku</option>
                    {freeItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.inventory_number ? ` (${item.inventory_number})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ve-quantity" className="block text-sm font-medium text-gray-700 mb-1">
                    Množstvo
                  </label>
                  <input
                    id="ve-quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    defaultValue="1"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="ve-placement" className="block text-sm font-medium text-gray-700 mb-1">
                    Umiestnenie vo vozidle
                  </label>
                  <input
                    id="ve-placement"
                    name="placement"
                    className={inputCls}
                    placeholder="Napr. Ľavá skrinka"
                  />
                </div>
                <div>
                  <label htmlFor="ve-notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Poznámka
                  </label>
                  <input id="ve-notes" name="notes" className={inputCls} />
                </div>
              </div>
              <div className="mt-4">
                <Button type="submit" variant="primary" size="sm">Priradiť k vozidlu</Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
