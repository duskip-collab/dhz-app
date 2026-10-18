import { Truck } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getVehicles } from "@/lib/equipment/vehicles.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

function stkTone(validUntil: string | null): "green" | "yellow" | "red" | "gray" {
  if (!validUntil) return "gray";
  const diff = Math.ceil(
    (new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0) return "red";
  if (diff <= 30) return "yellow";
  return "green";
}

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.VEHICLE_VIEW);
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  const vehicles = await getVehicles();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            <Truck className="h-4 w-4" /> Technika
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Vozidlá</h1>
          <p className="mt-1 text-sm text-gray-500">
            Prehľad zásahových a úžitkových vozidiel zboru.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/vehicle-equipment">
            <Button variant="secondary" size="sm">Výzbroj vozidiel</Button>
          </Link>
          <Link href="/inspections">
            <Button variant="secondary" size="sm">Revízie</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {vehicles.length === 0 ? (
        <EmptyState
          title="Žiadne vozidlá"
          description="Vozidlá sa evidujú ako položky inventára s údajmi vozidla (SPZ, VIN). Pridajte ich cez Výstroj / Nová položka."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((v) => (
            <div key={v.id} className="border rounded-xl bg-white p-4 shadow-sm">
              <div className="flex justify-between items-start gap-2 mb-2">
                <h2 className="text-lg font-semibold text-gray-900">
                  <Link href={`/vehicle-equipment?vehicle=${v.id}`} className="hover:text-[#C62828]">
                    {v.name}
                  </Link>
                </h2>
                <Badge tone={v.status === "AVAILABLE" ? "green" : v.status === "DAMAGED" ? "red" : "blue"}>
                  {v.status}
                </Badge>
              </div>
              <dl className="space-y-1 text-sm text-gray-600">
                <div className="flex justify-between">
                  <dt>SPZ</dt>
                  <dd className="font-medium text-gray-900">
                    {v.vehicle_details?.license_plate ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Km</dt>
                  <dd>{v.vehicle_details?.mileage_km?.toLocaleString("sk-SK") ?? "—"}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt>STK do</dt>
                  <dd>
                    {v.vehicle_details?.stk_valid_until ? (
                      <Badge tone={stkTone(v.vehicle_details.stk_valid_until)}>
                        {new Date(v.vehicle_details.stk_valid_until).toLocaleDateString("sk-SK")}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt>EK do</dt>
                  <dd>
                    {v.vehicle_details?.ek_valid_until ? (
                      <Badge tone={stkTone(v.vehicle_details.ek_valid_until)}>
                        {new Date(v.vehicle_details.ek_valid_until).toLocaleDateString("sk-SK")}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                <Link
                  href={`/vehicle-equipment?vehicle=${v.id}`}
                  className="text-sm text-[#C62828] hover:underline"
                >
                  Výzbroj →
                </Link>
                <Link href={`/gear/${v.id}`} className="text-sm text-gray-500 hover:text-[#C62828]">
                  Detail
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
