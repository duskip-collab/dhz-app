// Zoznam transakcii - server component.
// Nacita data z `public.finance_transactions` podla URL filtrov.

import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { TransactionFilters } from "./filters";
import { TransactionTable } from "./table";

export interface TxRow {
  id: string;
  account_id: string;
  category_id: string | null;
  type: string;
  status: string;
  amount_minor: number;
  transaction_date: string;
  document_number: string | null;
  description: string | null;
}

export interface SimpleAccount { id: string; name: string }
export interface SimpleCategory { id: string; name: string; code: string }

export default async function FinanceTransactionsPage({
  searchParams,
}: {
  searchParams: { [k: string]: string | string[] | undefined };
}) {
  await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const pick = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
  const accountId = pick(searchParams.account_id);
  const status = pick(searchParams.status);
  const type = pick(searchParams.type);

  const supabase = await createClient();
  const { data: txs } = await supabase
    .from("finance_transactions")
    .select("id,account_id,category_id,type,status,amount_minor,transaction_date,document_number,description")
    .order("transaction_date", { ascending: false })
    .limit(200);
  const { data: accs } = await supabase
    .from("finance_accounts")
    .select("id,name")
    .eq("is_active", true)
    .order("name");
  const { data: cats } = await supabase
    .from("finance_categories")
    .select("id,name,code")
    .eq("is_active", true)
    .order("sort_order");

  const rows = ((txs ?? []) as TxRow[]).filter((t) => {
    if (accountId && t.account_id !== accountId) return false;
    if (status && t.status !== status) return false;
    if (type && t.type !== type) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Finance</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Transakcie</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pocet zaznamov: <span className="font-semibold tabular-nums">{rows.length}</span>
        </p>
      </div>
      <TransactionFilters
        accounts={(accs ?? []) as SimpleAccount[]}
        accountId={accountId}
        status={status}
        type={type}
      />
      {rows.length === 0 ? (
        <Card title="Ziadne transakcie" subtitle="Pri filtrovani nie su zaznamy.">
          <p className="text-sm text-gray-500">Zmente filtre alebo ulozte novu transakciu.</p>
        </Card>
      ) : (
        <TransactionTable
          rows={rows}
          accounts={(accs ?? []) as SimpleAccount[]}
          categories={(cats ?? []) as SimpleCategory[]}
        />
      )}
    </div>
  );
}
