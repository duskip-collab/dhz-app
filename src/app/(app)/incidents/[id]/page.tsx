import { ArrowLeft, Siren, Clock, MapPin, Users, Truck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { loadIncidentById } from "../actions";
import { deleteIncidentAction } from "../actions";
import { TypeBadge, StatusBadge, formatDateTime } from "@/features/incidents/components/IncidentBadges";
import { Button } from "@/components/ui/Button";

export default async function IncidentDetailPage({
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

  const ctx = await requirePermission(PERMISSIONS.INCIDENTS_VIEW);
  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.INCIDENTS_EDIT);
  const canDelete = hasPermission(ctx.permissions, PERMISSIONS.INCIDENTS_DELETE);

  let incident;
  try {
    incident = await loadIncidentById(id);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/incidents"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
      >
        <ArrowLeft className="h-4 w-4" /> Späť na výjazdy
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
              <Siren className="h-4 w-4" /> Výjazdy a zásahy
            </p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{incident.title}</h1>
            {incident.incident_number && (
              <p className="mt-0.5 text-sm text-gray-500">Číslo zásahu: #{incident.incident_number}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <TypeBadge type={incident.type} />
            <StatusBadge status={incident.status} />
            {canEdit && (
              <Link href={`/incidents/${id}/edit`} className="text-sm text-[#C62828] hover:underline">
                Upraviť
              </Link>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Miesto</dt>
            <dd className="mt-0.5 text-gray-900">{incident.location}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Nahlásené</dt>
            <dd className="mt-0.5 tabular-nums text-gray-600">
              {formatDateTime(incident.reported_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Vyslané</dt>
            <dd className="mt-0.5 text-gray-600">
              {incident.dispatched_at ? formatDateTime(incident.dispatched_at) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Príchod na miesto</dt>
            <dd className="mt-0.5 text-gray-600">
              {incident.arrived_at ? formatDateTime(incident.arrived_at) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Návrat</dt>
            <dd className="mt-0.5 text-gray-600">
              {incident.returned_at ? formatDateTime(incident.returned_at) : "—"}
            </dd>
          </div>
        </dl>

        {incident.description && (
          <div className="mt-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">Popis</h2>
            <p className="mt-1 text-sm text-gray-700">{incident.description}</p>
          </div>
        )}
        {incident.command_notes && (
          <div className="mt-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">Veliteľské poznámky</h2>
            <p className="mt-1 text-sm text-gray-700">{incident.command_notes}</p>
          </div>
        )}
        {incident.weather_conditions && (
          <div className="mt-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">Počasie</h2>
            <p className="mt-1 text-sm text-gray-700">{incident.weather_conditions}</p>
          </div>
        )}
      </div>
      {incident.responders.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-gray-400" />
            <h2 className="text-base font-bold text-gray-900">Posádka ({incident.responders.length})</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {incident.responders.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 p-3 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C62828]/10 text-sm font-bold text-[#C62828]">
                  {r.member ? `${r.member.first_name.charAt(0)}${r.member.last_name.charAt(0)}` : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {r.member ? `${r.member.first_name} ${r.member.last_name}` : "Neznámy člen"}
                    {r.member?.member_number ? ` (${r.member.member_number})` : ""}
                  </p>
                  <p className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded inline-block">
                    {r.role}
                  </p>
                  {r.notes && (
                    <p className="mt-1 text-xs text-gray-500">{r.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {incident.equipment.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="h-5 w-5 text-gray-400" />
            <h2 className="text-base font-bold text-gray-900">Použitá technika ({incident.equipment.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th scope="col" className="px-4 py-3 font-semibold">Technika</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Ev. číslo</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">Motohodiny</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">Km</th>
                </tr>
              </thead>
              <tbody>
                {incident.equipment.map((eq) => (
                  <tr key={eq.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 text-gray-900">{eq.equipment?.name ?? "Neznáma technika"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {eq.equipment?.inventory_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-right text-gray-600">
                      {eq.engine_hours_used ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-right text-gray-600">
                      {eq.kilometers_driven ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canDelete && (
        <form action={deleteIncidentAction} method="post">
          <input type="hidden" name="incidentId" value={incident.id} />
          <Button type="submit" variant="danger" size="sm">
            Odstrániť zásah
          </Button>
        </form>
      )}
    </div>
  );
}