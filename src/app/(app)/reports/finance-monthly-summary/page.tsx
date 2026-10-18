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
  getFinanceMonthlySummary,
  type FinanceMonthlySummaryReport,
} from "@/lib/reports/finance-monthly-summary.service";

const REPORT_ID = "finance-monthly-summary";

/**
 * Formátuje minor units (halierov) na EUR reťazec. VÝHRADNE prezentačná
 * vrstva — logika reportu pracuje len v minor units.
 */
function eur(minor: number): string {
  const sign = minor < 0 ? "−" : "";
  const abs = Math.abs(minor) / 100;
  return `${sign}€ ${abs.toLocaleString("sk-SK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function MonthTable({ report }: { report: FinanceMonthlySummaryReport }) {
  if (report.summary.months.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Zatiaľ nie sú evidované žiadne zaúčtované (POSTED) transakcie.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="py-2 pr-4">Mesiac</th>
            <th className="py-2 pr-4 text-right">Príjmy</th>
            <th className="py-2 pr-4 text-right">Výdavky</th>
            <th className="py-2 pr-4 text-right">Netto</th>
            <th className="py-2 text-right">Transakcií</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {report.summary.months.map((m) => (
            <tr key={m.month}>
              <td className="py-2 pr-4 font-medium tabular-nums text-gray-900">
                {m.month}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-[#2E7D32]">
                {eur(m.incomeMinor)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-[#C62828]">
                {eur(m.expenseMinor)}
              </td>
              <td
                className={`py-2 pr-4 text-right font-semibold tabular-nums ${
                  m.netMinor < 0 ? "text-[#C62828]" : "text-gray-900"
                }`}
              >
                {eur(m.netMinor)}
              </td>
              <td className="py-2 text-right tabular-nums text-gray-600">
                {m.postedCount}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 font-semibold">
            <td className="py-2 pr-4 text-gray-900">Spolu</td>
            <td className="py-2 pr-4 text-right tabular-nums text-[#2E7D32]">
              {eur(report.summary.totals.incomeMinor)}
            </td>
            <td className="py-2 pr-4 text-right tabular-nums text-[#C62828]">
              {eur(report.summary.totals.expenseMinor)}
            </td>
            <td
              className={`py-2 pr-4 text-right tabular-nums ${
                report.summary.totals.netMinor < 0
                  ? "text-[#C62828]"
                  : "text-gray-900"
              }`}
            >
              {eur(report.summary.totals.netMinor)}
            </td>
            <td className="py-2 text-right tabular-nums text-gray-600">
              {report.summary.totals.postedCount}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CategoryTable({ report }: { report: FinanceMonthlySummaryReport }) {
  if (report.categories.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Žiadna kategória nemá zaúčtovaný pohyb.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="py-2 pr-4">Kategória</th>
            <th className="py-2 pr-4">Smer</th>
            <th className="py-2 pr-4 text-right">Príjmy</th>
            <th className="py-2 text-right">Výdavky</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {report.categories.map((c) => (
            <tr key={c.categoryId ?? "unknown"}>
              <td className="py-2 pr-4 font-medium text-gray-900">
                {c.categoryName}
              </td>
              <td className="py-2 pr-4">
                <Badge tone={c.direction === "INCOME" ? "green" : "red"}>
                  {c.direction === "INCOME" ? "Príjem" : "Výdaj"}
                </Badge>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-600">
                {c.incomeMinor > 0 ? eur(c.incomeMinor) : "—"}
              </td>
              <td className="py-2 text-right tabular-nums text-gray-600">
                {c.expenseMinor > 0 ? eur(c.expenseMinor) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


export default async function FinanceMonthlySummaryPage() {
  // 1) Vstupný guard: reports.view. Beží PRED akýmkoľvek načítaním dát.
  //    Žiadne finančné údaje sa nečítajú pred autorizáciou.
  const ctx = await requirePermission(PERMISSIONS.REPORTS_VIEW);

  // 2) AND gating z katalógu: report vyžaduje reports.view A finance.view
  //    (BEZ finance.export — export je mimo rozsahu). Bez finance.view sa
  //    finančné dáta vôbec nenačítajú.
  const definition = getReportDefinitions().find((r) => r.id === REPORT_ID);
  const canView = definition !== undefined && isReportAccessible(definition, ctx.permissions);

  // 3) Dáta načítame IBA ak je report dostupný. `getFinanceMonthlySummary()`
  //    navyše vykonáva vlastnú autorizáciu (defense-in-depth) a číta cez
  //    štandardný SSR klient (RLS `finance.view`), nie service-role.
  const report = canView ? await getFinanceMonthlySummary() : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
          Reporty / Financie
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          Mesačná finančná bilancia
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Mesačné príjmy, výdavky a netto bilancia zaúčtovaných (POSTED)
          transakcií. Vnútorné prevody sa do príjmov/výdavkov nepočítajú.
          Prístup vyžaduje oprávnenia reports.view aj finance.view.
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
            Pre zobrazenie tohto reportu potrebujete oprávnenie finance.view.
            Kontaktujte administrátora.
          </p>
        </Card>
      ) : (
        <>
          <Card
            title="Mesačná bilancia"
            subtitle="Len zaúčtované transakcie (POSTED); prevody sú cash-flow neutrálne."
          >
            <MonthTable report={report} />
          </Card>

          <Card
            title="Analýza kategórií"
            subtitle="Kategórie so zaúčtovaným pohybom (POSTED INCOME/EXPENSE)."
          >
            <CategoryTable report={report} />
          </Card>
        </>
      )}
    </div>
  );
}

