import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type {
  FinanceAccountBalanceRow,
  FinanceAccountRow,
} from "@/types/database.types";
import { loadFinanceAccounts, loadActiveCategories } from "./actions";
import { TransactionForm } from "@/components/TransactionForm";
import { TransferForm } from "@/app/dashboard/finance/transactions/TransferForm";
import { EditTransactionForm } from "@/components/EditTransactionForm";

const TYPE_LABELS: Record<string, string> = {
  CASH: "Pokladna",
  BANK: "Bankovy ucet",
  OTHER: "Ine",
};

function eur(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "—";
  return `€ ${(Math.round(Math.abs(minor) * 100) / 100).toFixed(2)}`;
}

export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams: { [k: string]: string | string[] | undefined };
}) {
  await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const pick = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
  const showNew = pick(searchParams.new) === "true";
  const showTransfer = pick(searchParams.transfer) === "true";
  const showEdit = pick(searchParams.edit) === "true";
  const presetAccount = pick(searchParams.account_id);

  const supabase = await createClient();
  const { data: balances } = await supabase
    .from("finance_account_balances")
    .select("*")
    .order("account_name", { ascending: true });

  const rows = (balances ?? []) as FinanceAccountBalanceRow[];
  const ids = rows.map((b) => b.account_id);
  const { data: accRows } = ids.length
    ? await supabase.from("finance_accounts").select("*").in("id", ids)
    : { data: [] as FinanceAccountRow[] };
  const typeById = new Map(
    ((accRows ?? []) as FinanceAccountRow[]).map((a) => [a.id, a.type]),
  );

  const total = rows.reduce((s, b) => s + Number(b.current_balance_minor ?? 0), 0);
  const accounts = await loadFinanceAccounts();
  const categories = await loadActiveCategories();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Finance</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Prehlad financii</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pocet uctov: <span className="font-semibold tabular-nums">{rows.length}</span>
          {" · "}
          Celkovy zostatok: <span className="font-semibold tabular-nums">{eur(total)}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/finance/transactions">
          <Button variant="secondary" size="sm">Zoznam transakcii</Button>
        </Link>
        <Link href="/dashboard/finance?new=true">
          <Button size="sm">Nova transakcia</Button>
        </Link>
        <Link href="/dashboard/finance?transfer=true">
          <Button variant="ghost" size="sm">Prevod</Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card title="Ucty" subtitle="Ziadne aktivne ucty.">
          <p className="text-sm text-gray-500">Kontaktujte administratora.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((b) => (
            <Card
              key={b.account_id}
              title={b.account_name}
              subtitle={`${TYPE_LABELS[typeById.get(b.account_id) ?? ""] ?? "Ucet"} · ${b.currency}`}
            >
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Pociatocny</span>
                  <span className="font-mono font-semibold tabular-nums">{eur(b.opening_balance_minor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Pohyb (POSTED)</span>
                  <span className="font-mono font-semibold tabular-nums">{eur(b.posted_movement_minor)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Aktualny</span>
                  <span className="text-base font-bold">{eur(b.current_balance_minor)}</span>
                </div>
              </div>
              <div className="mt-4">
                <Link href={`/dashboard/finance/transactions?account_id=${b.account_id}`}>
                  <Button variant="secondary" size="sm">Transakcie uctu</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(showNew || presetAccount) && (
        <TransactionForm
          accounts={accounts}
          categories={categories}
          initial={presetAccount ? { account_id: presetAccount } : undefined}
        />
      )}
      {showTransfer && <TransferForm accounts={accounts} />}
      {showEdit && <EditTransactionForm accounts={accounts} onSuccess={() => revalidateFinance()} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="Typy transakcii" subtitle="Evidovane smery.">
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">INCOME</Badge>
            <Badge tone="red">EXPENSE</Badge>
            <Badge tone="blue">TRANSFER_OUT</Badge>
            <Badge tone="gray">TRANSFER_IN</Badge>
          </div>
        </Card>
        <Card title="Stavy" subtitle="Stav zaznamu.">
          <div className="flex flex-wrap gap-2">
            <Badge tone="blue">DRAFT</Badge>
            <Badge tone="green">POSTED</Badge>
            <Badge tone="red">VOID</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}

