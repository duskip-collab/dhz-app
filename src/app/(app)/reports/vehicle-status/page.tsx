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
  getVehicleStatus,
  type VehicleStatusReport,
} from "@/lib/reports/vehicle-status.service";

const REPORT_ID = "vehicle-status";

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Dostupné",
  IN_SERVICE: "V prevádzke",
  RESERVED: "Rezervované",
  DAMAGED: "Poškodené",
  DISPOSED: "Vyradené",
};

const STATUS_TONES: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  AVAILABLE: "green",
  IN_SERVICE: "blue",
  RESERVED: "yellow",
  DAMAGED: "red",
  DISPOSED: "gray",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusTone(status: string): "green" | "blue" | "yellow" | "red" | "gray" {
  return STATUS_TONES[status] ?? "gray";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso;
}

function ReportTable({ report }: { report: VehicleStatusReport }) {
  if (report.vehicles.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Zatiaľ nie sú evidované žiadne vozidlá.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="py-2 pr-4">Názov</th>
            <th className="py-2 pr-4">ŠPZ</th>
            <th className="py-2 pr-4">Stav</th>
            <th className="py-2 pr-4">STK do</th>
            <th className="py-2 pr-4">EK do</th>
            <th className="py-2">VIN</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {report.vehicles.map((vehicle) => (
            <tr key={vehicle.id}>
              <td className="py-2 pr-4 font-medium text-gray-900">{vehicle.name}</td>
              <td className="py-2 pr-4 text-gray-600">
                {vehicle.licensePlate ?? "—"}
              </td>
              <td className="py-2 pr-4">
                <Badge tone={statusTone(vehicle.status)}>
                  {statusLabel(vehicle.status)}
                </Badge>
              </td>
              <td className="py-2 pr-4 tabular-nums text-gray-600">
                {formatDate(vehicle.stkValidUntil)}
              </td>
              <td className="py-2 pr-4 tabular-nums text-gray-600">
                {formatDate(vehicle.ekValidUntil)}
              </td>
              <td className="py-2 text-gray-600">{vehicle.vin ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


export default async function VehicleStatusReportPage() {
  // 1) Vstupný guard: reports.view. Beží PRED akýmkoľvek načítaním dát.
  const ctx = await requirePermission(PERMISSIONS.REPORTS_VIEW);

  // 2) AND gating z katalógu: report je dostupný len pri reports.view A
  //    vehicle.view. Bez vehicle.view sa dáta vôbec nenačítajú.
  const definition = getReportDefinitions().find((r) => r.id === REPORT_ID);
  const canView = definition !== undefined && isReportAccessible(definition, ctx.permissions);

  // 3) Dáta načítame IBA ak je report dostupný. `getVehicleStatus()`
  //    navyše vykonáva vlastnú autorizáciu (defense-in-depth) a číta cez
  //    štandardný SSR klient (RLS), nie service-role.
  const report = canView ? await getVehicleStatus() : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
          Reporty / Vozidlá
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          Vozidlá a technika
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Prehľad vozidiel, ich stavu a platnosti technickej kontroly (STK/EK).
          Prístup vyžaduje oprávnenia reports.view aj vehicle.view.
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
            Pre zobrazenie tohto reportu potrebujete oprávnenie vehicle.view.
            Kontaktujte administrátora.
          </p>
        </Card>
      ) : (
        <>
          <Card
            title="Súhrn"
            subtitle="Aktuálny počet vozidiel a blížiace sa STK (do 30 dní)."
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Celkom vozidiel
                </p>
                <p className="text-xl font-bold tabular-nums text-gray-900">
                  {report.summary.total}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  STK do 30 dní
                </p>
                <p
                  className={`text-xl font-bold tabular-nums ${
                    report.summary.stkExpiringSoon > 0
                      ? "text-[#F9A825]"
                      : "text-gray-900"
                  }`}
                >
                  {report.summary.stkExpiringSoon}
                </p>
              </div>
              {Object.entries(report.summary.byStatus).map(([status, count]) => (
                <div key={status}>
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    {statusLabel(status)}
                  </p>
                  <p className="text-xl font-bold tabular-nums text-gray-900">
                    {count}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Zoznam vozidiel"
            subtitle="Názov, ŠPZ, stav a platnosť STK/EK."
          >
            <ReportTable report={report} />
          </Card>
        </>
      )}
    </div>
  );
}

