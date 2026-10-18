import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  getReportDefinitions,
  filterAccessibleReports,
  filterPlannedReports,
  isReportAccessible,
  type ReportDefinition,
} from "@/lib/reports/reports.core";
import { getMembersOverview, type MembersOverviewSummary } from "@/lib/reports/members-overview.service";

const MEMBERS_OVERVIEW_ID = "members-overview";

const MODULE_LABELS: Record<string, string> = {
  members: "Členovia",
  training: "Tréningy",
  competition: "Súťaže",
  calendar: "Kalendár",
  inventory: "Inventár",
  vehicle: "Vozidlá",
  incidents: "Výjazdová činnosť",
  finance: "Financie",
};

function ReportRow({ report }: { report: ReportDefinition }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{report.name}</h3>
          <Badge tone={report.status === "available" ? "green" : "gray"}>
            {report.status === "available" ? "Dostupný" : "Pripravovaný"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-gray-500">{report.description}</p>
        <p className="mt-1 text-xs text-gray-400">Modul: {MODULE_LABELS[report.module] ?? report.module}</p>
      </div>
      {report.status === "available" && report.route ? (
        <div className="shrink-0">
          <Link href={report.route}>
            <Button variant="secondary" size="sm">Otvoriť report</Button>
          </Link>
        </div>
      ) : null}
    </li>
  );
}

function MembersOverviewCard({ summary }: { summary: MembersOverviewSummary }) {
  const entries = Object.entries(summary.byMembershipType).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <Card
      title="Prehľad členov"
      subtitle="Agregované údaje z modulu Členovia (zdroj: members.view)."
    >
      {summary.total === 0 ? (
        <p className="text-sm text-gray-500">
          Zatiaľ nie sú evidovaní žiadni členovia.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Celkom</p>
              <p className="text-xl font-bold tabular-nums text-gray-900">{summary.total}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Aktívni</p>
              <p className="text-xl font-bold tabular-nums text-[#2E7D32]">{summary.active}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Neaktívni</p>
              <p className="text-xl font-bold tabular-nums text-gray-500">{summary.inactive}</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Podľa typu členstva</p>
            <ul className="mt-2 space-y-1">
              {entries.map(([type, count]) => (
                <li key={type} className="flex justify-between text-sm">
                  <span className="text-gray-600">{type}</span>
                  <span className="font-semibold tabular-nums text-gray-900">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

export default async function Page() {
  const ctx = await requirePermission(PERMISSIONS.REPORTS_VIEW);

  const allReports = getReportDefinitions();
  const accessible = filterAccessibleReports(ctx.permissions);
  const planned = filterPlannedReports();

  // Pilotný report — dáta načítame IBA ak má používateľ aj oprávnenie zdrojového
  // modulu (members.view). `getMembersOverview()` vykonáva vlastnú autorizáciu
  // (defense-in-depth), takže obmedzenie tu je ochrana pred zbytočným volaním.
  const membersOverviewDef = allReports.find((r) => r.id === MEMBERS_OVERVIEW_ID);
  const canLoadMembersOverview =
    membersOverviewDef !== undefined && isReportAccessible(membersOverviewDef, ctx.permissions);

  let membersOverview: MembersOverviewSummary | null = null;
  if (canLoadMembersOverview) {
    membersOverview = await getMembersOverview();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Reporty</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Reporty a analýza</h1>
        <p className="mt-1 text-sm text-gray-500">
          Prehľad prevádzkových a analytických reportov. Prístup k dátam každého
          reportu je riadený samostatným oprávnením zdrojového modulu.
        </p>
      </div>

      {membersOverview !== null && <MembersOverviewCard summary={membersOverview} />}

      <Card title="Dostupné reporty" subtitle="Reporty, na ktoré máte oprávnenie.">
        {accessible.length === 0 ? (
          <p className="text-sm text-gray-500">
            Zatiaľ nemáte prístup k žiadnemu dostupnému reportu.
          </p>
        ) : (
          <ul className="space-y-3">
            {accessible.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </ul>
        )}
      </Card>

      {planned.length > 0 && (
        <Card title="Pripravované reporty" subtitle="Reporty vo vývoji — dáta zatiaľ nie sú dostupné.">
          <ul className="space-y-3">
            {planned.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

