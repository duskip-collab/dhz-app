import { Siren, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import type { Incident, IncidentType, IncidentStats as IncidentStatsType } from "@/types/incidents";
import type { Member } from "@/lib/members/members.service";
import type { EquipmentItem } from "@/lib/equipment/equipment.service";
import { getIncidentStats, getIncidents } from "@/lib/incidents/incidents.service";
import { listMembers } from "@/lib/members/members.service";
import { getEquipmentItems } from "@/lib/equipment/equipment.service";
import { Card } from "@/components/ui/Card";
import { QuickActions } from "@/features/dashboard/QuickActions";
import { IncidentFilters } from "@/features/incidents/components/IncidentFilters";
import { IncidentList } from "@/features/incidents/components/IncidentList";
import { IncidentStats } from "@/features/incidents/components/IncidentStats";
import { NewIncidentButton } from "@/features/incidents/components/NewIncidentButton";

// Dashboard je pripravený na rozdielny obsah podľa rolí/permisí.
// Finančná sekcia sa zobrazí len pri finance.view – inak sa ani nenačíta.
export default async function DashboardPage() {
  const ctx = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
  const firstName = (ctx.email ?? "Hasič").split("@")[0];
  const canSeeFinance = ctx.permissions.includes(PERMISSIONS.FINANCE_VIEW);

  // Výjazdy band – zobrazíme iba pre používateľov s incidents.view.
  const canViewIncidents = hasPermission(ctx.permissions, PERMISSIONS.INCIDENTS_VIEW);
  const canViewMembers = hasPermission(ctx.permissions, PERMISSIONS.MEMBERS_VIEW);
  let stats: IncidentStatsType = {
    total: 0,
    completedCount: 0,
    totalEngineHours: 0,
    totalKilometers: 0,
    mostFrequentType: null,
    byType: {
      FIRE: 0,
      TECHNICAL: 0,
      FLOOD: 0,
      TRAFFIC_ACCIDENT: 0,
      TACTICAL_EXERCISE: 0,
      OTHER: 0,
    },
  };
  let incidents: Incident[] = [];
  let members: Member[] = [];
  let equipment: EquipmentItem[] = [];

  if (canViewIncidents) {
    try {
      const [s, i, e] = await Promise.all([
        getIncidentStats(),
        getIncidents(),
        getEquipmentItems({}),
      ]);
      stats = s;
      incidents = i;
      equipment = e;
    } catch {
      // V prípade chyby načítania zostávajú prázdne dáta.
    }

    if (canViewMembers) {
      try {
        members = await listMembers({ status: "active" });
      } catch (error) {
        // Členovia sú voliteľní pre dashboard; ostatné údaje výjazdov ostanú dostupné.
        console.warn(
          "[DashboardPage] Could not load the optional member list.",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }
  }

  const canCreate =
    canViewIncidents && hasPermission(ctx.permissions, PERMISSIONS.INCIDENTS_CREATE);

  return (
    <div className="space-y-6">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          <Siren className="h-4 w-4" /> DHZ
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Dobrý deň, {firstName}</h1>
        <p className="mt-1 text-sm text-gray-500">Tu je prehľad aktuálneho diania v DHZ.</p>
      </div>

      {canViewIncidents ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                <Siren className="h-4 w-4" /> Výjazdy a zásahy
              </p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900">Výjazdy</h1>
              <p className="mt-1 text-sm text-gray-500">
                Celkovo výjazdov: <span className="font-semibold tabular-nums text-gray-800">{stats.total}</span>
                {" · "}
                Dokončených: <span className="font-semibold tabular-nums text-gray-800">{stats.completedCount}</span>
              </p>
            </div>
            {canCreate ? <NewIncidentButton members={members} equipment={equipment} /> : null}
          </div>

          <IncidentStats stats={stats} />

          <IncidentFilters resultCount={incidents.length} />

          <IncidentList incidents={incidents} />
        </div>
      ) : (
        <Card title="Výjazdy" subtitle="Prehľad sa zobrazí len pre používateľov s permisiou incidents.view.">
          <p className="text-sm text-gray-500">
            Pre zobrazenie výjazdov sa prihláste s odovzdanou permisiou incidents.view.
          </p>
        </Card>
      )}

      {canSeeFinance ? (
        <Card title="Finančný prehľad" subtitle="DEMO – viditeľné len s finance.view">
          <p className="text-sm text-gray-600">
            Finančné dáta sa načítajú až po overení permisie na serveri. Bežný člen bez
            finance.view túto sekciu vôbec nevidí a dáta sa pre neho nenačítajú.
          </p>
        </Card>
      ) : null}

      <QuickActions permissions={ctx.permissions} />
    </div>
  );
}
