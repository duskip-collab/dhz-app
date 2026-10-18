import { Landmark } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getFinanceLedger, LEDGER_MAX_ROWS } from "@/lib/reports/finance-ledger.service";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white";

export default async function FinancePage() {
  const ctx = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const canManage = hasPermission(ctx.permissions, PERMISSIONS.FINANCE_EDIT);

  let report: any = null;
  try {
    report = await getFinanceLedger(null);
  } catch {
    report = null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Landmark className="h-6 w-6 text-[#C62828]" />
        <h1 className="text-2xl font-bold text-gray-900">Financie</h1>
      </div>

      {report ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Príjmy</p>
            <p className="text-xl font-bold text-green-600">€{(report.totals.incomeMinor / 100).toFixed(2)}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Výdavky</p>
            <p className="text-xl font-bold text-red-600">€{(report.totals.expenseMinor / 100).toFixed(2)}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Saldo</p>
            <p className="text-xl font-bold text-gray-900">€{(report.totals.netMinor / 100).toFixed(2)}</p>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Finance nie sú dostupné.</p>
      )}

      <div className="flex gap-4 flex-wrap">
        <Link href="/dashboard/finance">
          <Button variant="secondary" size="sm">Transakcií</Button>
        </Link>
        <Link href="/reports">
          <Button variant="secondary" size="sm">Reporty</Button>
        </Link>
        {canManage && (
          <Link href="/dashboard/finance/transactions">
            <Button variant="primary" size="sm">+ Nová transakcia</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
