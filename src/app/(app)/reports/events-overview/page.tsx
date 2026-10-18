import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  getReportDefinitions,
  isReportAccessible,
} from "@/lib/reports/reports.core";
import {
  getEventsOverview,
  type EventsOverviewReport,
} from "@/lib/reports/events-overview.service";

const REPORT_ID = "events-overview";

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Plánované",
  COMPLETED: "Uskutočnené",
  CANCELLED: "Zrušené",
};

const STATUS_TONES: Record<string, "blue" | "green" | "red" | "gray"> = {
  PLANNED: "blue",
  COMPLETED: "green",
  CANCELLED: "red",
};

const TYPE_LABELS: Record<string, string> = {
  TRAINING: "Tréning",
  COMPETITION: "Súťaž",
};

const TYPE_TONES: Record<string, "blue" | "yellow"> = {
  TRAINING: "blue",
  COMPETITION: "yellow",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusTone(status: string): "blue" | "green" | "red" | "gray" {
  return STATUS_TONES[status] ?? "gray";
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function typeTone(type: string): "blue" | "yellow" {
  return TYPE_TONES[type] ?? "blue";
}

function ReportTable({ report }: { report: EventsOverviewReport }) {
  if (report.events.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Zatiaľ nie sú evidované žiadne udalosti, tréningy ani akcie.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="py-2 pr-4">Názov</th>
            <th className="py-2 pr-4">Typ</th>
            <th className="py-2 pr-4">Dátum</th>
            <th className="py-2 pr-4">Miesto</th>
            <th className="py-2 pr-4">Stav</th>
            <th className="py-2">Účastníci</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {report.events.map((event) => (
            <tr key={`${event.type}-${event.id}`}>
              <td className="py-2 pr-4 font-medium text-gray-900">{event.title}</td>
              <td className="py-2 pr-4">
                <Badge tone={typeTone(event.type)}>{typeLabel(event.type)}</Badge>
              </td>
              <td className="py-2 pr-4 tabular-nums text-gray-600">{event.date}</td>
              <td className="py-2 pr-4 text-gray-600">{event.location ?? "—"}</td>
              <td className="py-2 pr-4">
                <Badge tone={statusTone(event.status)}>{statusLabel(event.status)}</Badge>
              </td>
              <td className="py-2 tabular-nums text-gray-600">{event.participants}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


export default async function EventsOverviewReportPage() {
  // 1) Vstupný guard: reports.view. Beží PRED akýmkoľvek načítaním dát.
  const ctx = await requirePermission(PERMISSIONS.REPORTS_VIEW);

  // 2) AND gating z katalógu: report je dostupný len pri reports.view A
  //    calendar.view. Bez calendar.view sa dáta vôbec nenačítajú.
  const definition = getReportDefinitions().find((r) => r.id === REPORT_ID);
  const canView = definition !== undefined && isReportAccessible(definition, ctx.permissions);

  // 3) Dáta načítame IBA ak je report dostupný. `getEventsOverview()`
  //    navyše vykonáva vlastnú autorizáciu (defense-in-depth) a číta cez
  //    štandardný SSR klient (RLS), nie service-role.
  const report = canView ? await getEventsOverview() : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
          Reporty / Udalosti
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          Udalosti, tréningy a akcie
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Prehľad tréningov a súťaží ako jednotný kalendár udalostí DHZ.
          Prístup vyžaduje oprávnenia reports.view aj calendar.view.
        </p>
        <div className="mt-3">
          <Link href="/reports">
            <Button variant="ghost" size="sm">Späť na reporty</Button>
          </Link>
        </div>
      </div>

      {report === null ? (
        <Card
          title="Report nie je dostupný"
          subtitle="Chýba oprávnenie zdrojového modulu."
        >
          <p className="text-sm text-gray-500">
            Pre zobrazenie tohto reportu potrebujete oprávnenie calendar.view.
            Kontaktujte administrátora.
          </p>
        </Card>
      ) : (
        <>
          <Card title="Súhrn" subtitle="Počet udalostí podľa typu a stavu.">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Celkom udalostí
                </p>
                <p className="text-xl font-bold tabular-nums text-gray-900">
                  {report.summary.total}
                </p>
              </div>
              {Object.entries(report.summary.byType).map(([type, count]) => (
                <div key={type}>
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    {typeLabel(type)}
                  </p>
                  <p className="text-xl font-bold tabular-nums text-gray-900">{count}</p>
                </div>
              ))}
              {Object.entries(report.summary.byStatus).map(([status, count]) => (
                <div key={status}>
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    {statusLabel(status)}
                  </p>
                  <p className="text-xl font-bold tabular-nums text-gray-900">{count}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Zoznam udalostí"
            subtitle="Tréningy a súťaže zoradené zostupne podľa dátumu."
          >
            <ReportTable report={report} />
          </Card>
        </>
      )}
    </div>
  );
}

