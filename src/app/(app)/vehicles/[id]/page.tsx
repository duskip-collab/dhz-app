import { ArrowLeft, Truck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getVehicleById } from "@/lib/equipment/vehicles.service";
import { listMembers } from "@/lib/members/members.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { assignResponsibleMemberAction, removeResponsibleMemberAction } from "../actions";

const ROLE_LABELS: Record<string, string> = {
  GARAGE_MASTER: "Garážmajster",
  MAINTENANCE: "Údržba / servis",
  MANAGER: "Správca techniky",
  DRIVER: "Vodič / obsluha",
};

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function stkTone(validUntil: string | null): "green" | "yellow" | "red" | "gray" {
  if (!validUntil) return "gray";
  const diff = Math.ceil(
    (new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0) return "red";
  if (diff <= 30) return "yellow";
  return "green";
}

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;

  const ctx = await requirePermission(PERMISSIONS.VEHICLE_VIEW);
  const canManage = hasPermission(ctx.permissions, PERMISSIONS.VEHICLE_MANAGE);

  let vehicle;
  try {
    vehicle = await getVehicleById(id);
  } catch {
    notFound();
  }

  // Aktívni členovia pre priradenie zodpovedných osôb.
  let members: Awaited<ReturnType<typeof listMembers>> = [];
  try {
    members = await listMembers({ status: "active" });
  } catch {
    members = [];
  }

  const assignedMemberIds = new Set(vehicle.responsible_members.map((r) => r.member_id));
  const availableMembers = members.filter((m) => !assignedMemberIds.has(m.id));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/vehicles"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
      >
        <ArrowLeft className="h-4 w-4" /> Späť na vozidlá
      </Link>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">{success}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
              <Truck className="h-4 w-4" /> Technika
            </p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{vehicle.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={vehicle.status === "AVAILABLE" ? "green" : vehicle.status === "DAMAGED" ? "red" : "blue"}>
                {vehicle.status}
              </Badge>
              {vehicle.category && <Badge tone="gray">{vehicle.category.name}</Badge>}
            </div>
          </div>
          <Badge tone={stkTone(vehicle.vehicle_details?.stk_valid_until ?? null)}>
            STK: {vehicle.vehicle_details?.stk_valid_until
              ? new Date(vehicle.vehicle_details.stk_valid_until).toLocaleDateString("sk-SK")
              : "—"}
          </Badge>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">SPZ</dt>
            <dd className="mt-0.5 font-semibold text-gray-900">{vehicle.vehicle_details?.license_plate ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">VIN</dt>
            <dd className="mt-0.5 text-gray-700">{vehicle.vehicle_details?.vin ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Km</dt>
            <dd className="mt-0.5 tabular-nums text-gray-700">
              {vehicle.vehicle_details?.mileage_km?.toLocaleString("sk-SK") ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Motohodiny</dt>
            <dd className="mt-0.5 tabular-nums text-gray-700">{vehicle.vehicle_details?.engine_hours ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">EK do</dt>
            <dd className="mt-0.5 text-gray-700">
              {vehicle.vehicle_details?.ek_valid_until
                ? new Date(vehicle.vehicle_details.ek_valid_until).toLocaleDateString("sk-SK")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Evidenčné číslo</dt>
            <dd className="mt-0.5 text-gray-700">{vehicle.inventory_number ?? "—"}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/vehicle-equipment?vehicle=${vehicle.id}`}>
            <Button variant="secondary" size="sm">Výzbroj vozidla</Button>
          </Link>
          <Link href={`/gear/${vehicle.id}`}>
            <Button variant="secondary" size="sm">Detail v inventári</Button>
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-gray-400" />
          <h2 className="text-base font-bold text-gray-900">Zodpovedné osoby</h2>
        </div>

        {vehicle.responsible_members.length === 0 ? (
          <p className="text-sm text-gray-500">
            K tomuto vozidlu zatiaľ nie je priradená žiadna zodpovedná osoba
            (garážmajster / správca / údržba).
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {vehicle.responsible_members.map((r) => (
              <li key={r.id} className="rounded-lg border border-gray-200 p-3 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C62828]/10 text-sm font-bold text-[#C62828]">
                  {r.member ? initials(r.member.first_name, r.member.last_name) : "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {r.member ? `${r.member.first_name} ${r.member.last_name}` : "Neznámy člen"}
                    {r.member?.member_number ? ` (${r.member.member_number})` : ""}
                  </p>
                  <p className="text-xs font-medium text-[#C62828]">
                    {ROLE_LABELS[r.role] ?? r.role}
                  </p>
                  {r.member?.phone || r.note ? (
                    <p className="text-xs text-gray-500">
                      {r.member?.phone ? `Tel: ${r.member.phone}` : ""}
                      {r.member?.phone && r.note ? " · " : ""}
                      {r.note ?? ""}
                    </p>
                  ) : null}
                </div>
                {canManage && (
                  <form action={removeResponsibleMemberAction}>
                    <input type="hidden" name="responsibility_id" value={r.id} />
                    <input type="hidden" name="vehicle_id" value={vehicle.id} />
                    <Button type="submit" variant="danger" size="sm">Odobrať</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form
            action={assignResponsibleMemberAction}
            className="mt-5 border-t border-gray-100 pt-4 flex flex-col md:flex-row gap-3 md:items-end"
          >
            <input type="hidden" name="vehicle_id" value={vehicle.id} />
            <div className="flex-1 min-w-0">
              <label htmlFor="member_id" className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Člen *
              </label>
              <select
                id="member_id"
                name="member_id"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
              >
                <option value="" disabled>Vyberte člena</option>
                {availableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.first_name} {m.last_name}
                    {m.member_number ? ` (${m.member_number})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor="role" className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Rola
              </label>
              <select
                id="role"
                name="role"
                defaultValue="MAINTENANCE"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
              >
                <option value="GARAGE_MASTER">Garážmajster</option>
                <option value="MAINTENANCE">Údržba / servis</option>
                <option value="MANAGER">Správca techniky</option>
                <option value="DRIVER">Vodič / obsluha</option>
              </select>
            </div>
            <input
              name="note"
              placeholder="Poznámka (voliteľné)"
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
            <Button type="submit" variant="primary" size="sm">
              <UserPlus className="h-4 w-4" /> Priradiť
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}