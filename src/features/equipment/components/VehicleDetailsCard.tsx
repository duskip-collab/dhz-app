import { Car, Gauge, Clock } from "lucide-react";
import type { EquipmentItemDetail } from "@/lib/equipment/equipment.service";
import { expiryClass, formatDate, expiryLabel } from "./EquipmentBadges";

export function VehicleDetailsCard({ item }: { item: EquipmentItemDetail }) {
  const vehicle = item.vehicle_details;
  const isVehicleCategory = item.category?.code === "VEHICLES";

  // Vykreslí sa len ak má vehicle_details alebo ide o kategóriu Vozidlo.
  if (!vehicle && !isVehicleCategory) return null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Car className="h-5 w-5 text-gray-400" /> Údaje vozidla
      </h2>

      {!vehicle ? (
        <p className="mt-3 text-sm text-gray-500">
          Pre túto položku nie sú evidované žiadne špecifické údaje vozidla.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">EČV</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-gray-900">
              {vehicle.license_plate ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">VIN</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-gray-700">{vehicle.vin ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Palivo</dt>
            <dd className="mt-0.5 text-gray-700">{vehicle.fuel_type ?? "—"}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Gauge className="h-3.5 w-3.5" /> Tachometer
            </dt>
            <dd className="mt-0.5 tabular-nums text-gray-700">{vehicle.mileage_km} km</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Clock className="h-3.5 w-3.5" /> Motohodiny
            </dt>
            <dd className="mt-0.5 tabular-nums text-gray-700">{vehicle.engine_hours} h</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">STK platné do</dt>
            <dd className={`mt-0.5 tabular-nums ${expiryClass(vehicle.stk_valid_until)}`}>
              {formatDate(vehicle.stk_valid_until)}
              {vehicle.stk_valid_until ? (
                <span className="block text-xs text-gray-400">({expiryLabel(vehicle.stk_valid_until)})</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">EK platné do</dt>
            <dd className={`mt-0.5 tabular-nums ${expiryClass(vehicle.ek_valid_until)}`}>
              {formatDate(vehicle.ek_valid_until)}
              {vehicle.ek_valid_until ? (
                <span className="block text-xs text-gray-400">({expiryLabel(vehicle.ek_valid_until)})</span>
              ) : null}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
