import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { loadCashbookEntries } from "../cashbook-actions";
import { CashBookForm } from "@/features/finance/components/CashBookForm";
import { formatMinor } from "@/lib/finance/finance-core";

export default async function CashbookPage() {
  await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("finance_accounts")
    .select("id, name, type")
    .order("name");
  const accList = (accounts ?? []).map((a) => ({
    id: a.id as string,
    name: a.name as string,
    type: a.type as string,
  }));

  let result: Awaited<ReturnType<typeof loadCashbookEntries>> | null = null;
  try {
    result = await loadCashbookEntries({ limit: 50 });
  } catch {
    result = null;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-bold">Pokladňa</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <CashBookForm action="income" accounts={accList} />
        <CashBookForm action="expense" accounts={accList} />
      </div>
      {result && (
        <div className="space-y-2">
          <p className="text-sm">
            Príjmy: {formatMinor(result.totalIncomeMinor)} · Výdavky:{" "}
            {formatMinor(result.totalExpenseMinor)} · Zostatok:{" "}
            {formatMinor(result.runningBalanceAtEnd)}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Dátum</th>
                <th>Popis</th>
                <th>Príjem</th>
                <th>Výdaj</th>
                <th>Zostatok</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.transactionDate}</td>
                  <td>{e.description}</td>
                  <td>{formatMinor(e.incomeMinor)}</td>
                  <td>{formatMinor(e.expenseMinor)}</td>
                  <td>{formatMinor(e.balanceAfterMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

