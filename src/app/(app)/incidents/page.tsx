import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { IncidentsListView } from "@/features/incidents/components/IncidentsListView";
import { loadIncidents } from "./actions";
import type { Incident, IncidentType, IncidentStatus } from "@/types/incidents";

const INCIDENT_TYPES: string[] = [
  "FIRE",
  "TECHNICAL",
  "FLOOD",
  "TRAFFIC_ACCIDENT",
  "TACTICAL_EXERCISE",
  "OTHER",
];
const INCIDENT_STATUSES: string[] = [
  "REPORTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

function one(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = params[key];
  const val = Array.isArray(v) ? v[0] : v;
  return val || undefined;
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERMISSIONS.INCIDENTS_VIEW);
  const canCreate = hasPermission(ctx.permissions, PERMISSIONS.INCIDENTS_CREATE);
  const params = await searchParams;

  const type = one(params, "type");
  const status = one(params, "status");
  const dateFrom = one(params, "date_from");
  const dateTo = one(params, "date_to");

  let incidents: Incident[] = [];
  try {
    incidents = await loadIncidents({
      type: type && INCIDENT_TYPES.includes(type) ? (type as IncidentType) : undefined,
      status: status && INCIDENT_STATUSES.includes(status) ? (status as IncidentStatus) : undefined,
      date_from: dateFrom,
      date_to: dateTo,
    });
  } catch {
    incidents = [];
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C62828]">
            Zásahová činnosť
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Výjazdy</h1>
          <p className="mt-1 text-sm text-gray-500">
            Prehľad, evidencia a správa zásahov jednotky.
          </p>
        </div>
      </header>

      <IncidentsListView incidents={incidents} canCreate={canCreate} />
    </div>
  );
}