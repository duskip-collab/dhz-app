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
  getEquipmentInventory,
  type EquipmentInventoryReport,
} from "@/lib/reports/equipment-inventory.service";

const REPORT_ID = "inventory-status";

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

function ReportTable({ report }: { report: EquipmentInventoryReport }) {
  if (report.items.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Zatiaľ nie sú evidované žiadne položky inventára.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="py-2 pr-4">Názov</th>
            <th className="py-2 pr-4">Kategória</th>
            <th className="py-2 pr-4">Stav</th>
            <th className="py-2 pr-4">Množstvo</th>
            <th className="py-2">Lokácia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {report.items.map((item) => (
            <tr key={item.id}>
              <td className="py-2 pr-4 font-medium text-gray-900">{item.name}</td>
              <td className="py-2 pr-4 text-gray-600">
                {item.categoryName ?? "—"}
              </td>
              <td className="py-2 pr-4">
                <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
              </td>
              <td className="py-2 pr-4 tabular-nums text-gray-600">1</td>
              <td className="py-2 text-gray-600">{item.location ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function EquipmentInventoryReportPage() {
  // 1) Vstupný guard: reports.view. Beží PRED akýmkoľvek načítaním dát.
  const ctx = await requirePermission(PERMISSIONS.REPORTS_VIEW);

  // 2) AND gating z katalógu: report je dostupný len pri reports.view A
  //    inventory.view. Bez inventory.view sa dáta vôbec nenačítajú.
  const definition = getReportDefinitions().find((r) => r.id === REPORT_ID);
  const canView = definition !== undefined && isReportAccessible(definition, ctx.permissions);

  // 3) Dáta načítame IBA ak je report dostupný. `getEquipmentInventory()`
  //    navyše vykonáva vlastnú autorizáciu (defense-in-depth) a číta cez
  //    štandardný SSR klient (RLS), nie service-role.
  const report = canView ? await getEquipmentInventory() : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
          Reporty / Inventár
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          Prehľad inventára a výzbroje
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Počet a stav položiek inventára podľa kategórií a lokality.
          Prístup vyžaduje oprávnenia reports.view aj inventory.view.
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
            Pre zobrazenie tohto reportu potrebujete oprávnenie inventory.view.
            Kontaktujte administrátora.
          </p>
        </Card>
      ) : (
        <>
          <Card
            title="Súhrn"
            subtitle="Aktuálny počet položiek inventára (1 riadok = 1 kus)."
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Celkom položiek
                </p>
                <p className="text-xl font-bold tabular-nums text-gray-900">
                  {report.summary.total}
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
            title="Položky inventára"
            subtitle="Zoznam položiek s kategóriou, stavom a lokálou."
          >
            <ReportTable report={report} />
          </Card>
        </>
      )}
    </div>
  );
}