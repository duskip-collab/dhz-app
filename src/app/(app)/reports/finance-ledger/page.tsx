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
  getFinanceLedger,
  type FinanceLedgerReport,
} from "@/lib/reports/finance-ledger.service";

const REPORT_ID = "finance-ledger";

const TYPE_BADGES: Record<
  string,
  { label: string; tone: "green" | "red" | "blue" | "gray" }
> = {
  INCOME: { label: "Príjem", tone: "green" },
  EXPENSE: { label: "Výdavok", tone: "red" },
  TRANSFER_IN: { label: "Prevod +", tone: "blue" },
  TRANSFER_OUT: { label: "Prevod −", tone: "gray" },
};

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

function LedgerTable({ report }: { report: FinanceLedgerReport }) {
  if (report.entries.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Žiadne zaúčtované (POSTED) transakcie
        {report.month ? ` v mesiaci ${report.month}` : ""}.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="py-2 pr-4">Dátum</th>
            <th className="py-2 pr-4">Typ</th>
            <th className="py-2 pr-4">Kategória</th>
            <th className="py-2 pr-4">Popis / doklad</th>
            <th className="py-2 text-right">Suma</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {report.entries.map((e) => {
            const badge = TYPE_BADGES[e.type] ?? {
              label: e.type,
              tone: "gray" as const,
            };
            return (
              <tr key={e.id}>
                <td className="py-2 pr-4 tabular-nums text-gray-900">
                  {e.transaction_date}
                </td>
                <td className="py-2 pr-4">
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </td>
                <td className="py-2 pr-4 text-gray-700">
                  {e.categoryName ?? "—"}
                </td>
                <td className="py-2 pr-4 text-gray-700">
                  <span>{e.description ?? "—"}</span>
                  {e.documentNumber && (
                    <span className="ml-2 text-xs text-gray-400">
                      ({e.documentNumber})
                    </span>
                  )}
                  {e.counterparty && (
                    <span className="block text-xs text-gray-500">
                      {e.counterparty}
                    </span>
                  )}
                </td>
                <td
                  className={`py-2 text-right tabular-nums ${
                    e.signedMinor < 0 ? "text-[#C62828]" : "text-[#2E7D32]"
                  }`}
                >
                  {eur(e.signedMinor)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 font-semibold">
            <td colSpan={3} className="py-2 pr-4 text-gray-900">
              Spolu ({report.rowCount} riadkov
              {report.truncated ? ", zobrazený strop" : ""})
            </td>
            <td className="py-2 pr-4 text-right text-gray-600">
              Príjmy {eur(report.totals.incomeMinor)} · Výdavky{" "}
              {eur(report.totals.expenseMinor)} · Prevody{" "}
              {report.totals.transferCount} ks
            </td>
            <td
              className={`py-2 text-right tabular-nums ${
                report.totals.netMinor < 0 ? "text-[#C62828]" : "text-gray-900"
              }`}
            >
              {eur(report.totals.netMinor)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default async function FinanceLedgerPage({
  searchParams,
}: {
  searchParams: { [k: string]: string | string[] | undefined };
}) {
  // 1) Vstupný guard: reports.view. Beží PRED akýmkoľvek čítaním dát.
  const ctx = await requirePermission(PERMISSIONS.REPORTS_VIEW);

  // 2) AND gating z katalógu: report vyžaduje reports.view A finance.view
  //    (BEZ finance.export). Bez finance.view sa dáta vôbec nečítajú.
  const definition = getReportDefinitions().find((r) => r.id === REPORT_ID);
  const canView =
    definition !== undefined && isReportAccessible(definition, ctx.permissions);

  // 3) Voliteľný filter mesiaca z URL (`?month=YYYY-MM`); neplatný sa ignoruje.
  const rawMonth = searchParams.month;
  const monthParam =
    typeof rawMonth === "string"
      ? rawMonth
      : Array.isArray(rawMonth)
        ? rawMonth[0]
        : undefined;

  // 4) Dáta načítame IBA ak je report dostupný. `getFinanceLedger()` navyše
  //    vykonáva vlastnú autorizáciu (defense-in-depth) a číta cez štandardný
  //    SSR klient (RLS `finance.view`), nie service-role.
  const report = canView ? await getFinanceLedger(monthParam) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
          Reporty / Financie
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          Transakčná listina
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Detail zaúčtovaných (POSTED) transakcií. DRAFT a VOID sa nezobrazujú.
          Prevody sú cash-flow neutrálne (nezapočítavajú sa do príjmov/výdavkov).
          Prístup vyžaduje oprávnenia reports.view aj finance.view.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/reports">
            <Button variant="ghost" size="sm">Späť na reporty</Button>
          </Link>
          <Link href="/reports/finance-ledger?month=2026-10">
            <Button variant="secondary" size="sm">Ukážka filtra mesiaca</Button>
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
        <Card
          title="Transakcie (POSTED)"
          subtitle={
            report.month
              ? `Filter mesiaca: ${report.month}`
              : "Bez filtra mesiaca (posledné riadky podľa stropu)."
          }
        >
          <LedgerTable report={report} />
        </Card>
      )}
    </div>
  );
}

