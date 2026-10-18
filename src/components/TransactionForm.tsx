// Pastebný formulár pre vytvorenie príjmu alebo výdavku v evidencii finančných
// transakcií. Používa server actions (`createTransactionAction`) na nahrávanie.
// Údaje z databázy (účty, kategórie) sa posielajú ako prop, pre aby bol
// komponent "use client" a vyhovoval React Hook Form stylu (liberálny).

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type {
  FinanceTransactionInsert,
  FinanceAccountsRow,
  FinanceCategoriesRow,
} from "@/types/database.types";

// =============================================================================
// Props
// =============================================================================

export interface TransactionFormProps {
  /** Aktívne účty (z `finance_account_balances` / `finance_accounts`) */
  accounts: FinanceAccountsRow[];
  /** Aktívne kategórie (s smerom INCOME/EXPENSE) */
  categories: FinanceCategoriesRow[];
  /** Stav pri načítaní (pre editovanie) */
  initial?: Partial<FinanceTransactionInsert>;
  /** TexT tlačidla */
  submitLabel?: string;
  /** Počiatočný status (DRAFT/POSTED) */
  defaultStatus?: "DRAFT" | "POSTED";
  /** Po nárasti úspechu */
  onSuccess?: () => void;
}

// =============================================================================
// Komponent
// =============================================================================

export function TransactionForm({
  accounts,
  categories,
  initial,
  submitLabel = "Uložiť transakciu",
  defaultStatus = "DRAFT",
  onSuccess,
}: TransactionFormProps) {
  const router = useRouter();

  // Form state
  const [accountId, setAccountId] = useState<string>(initial?.account_id ?? "");
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "");
  const [type, setType] = useState<"INCOME" | "EXPENSE">(() => {
    if (initial?.type === "INCOME" || initial?.type === "EXPENSE") return initial.type;
    return "INCOME";
  });
  const [amount, setAmount] = useState<string>(initial?.amount_minor?.toString() ?? "");
  const [date, setDate] = useState<string>(
    initial?.transaction_date
      ? initial.transaction_date.split("T")[0]
      : new Date().toISOString().split("T")[0],
  );
  const [documentNumber, setDocumentNumber] = useState<string>(initial?.document_number ?? "");
  const [description, setDescription] = useState<string>(initial?.description ?? "");
  const [post, setPost] = useState<boolean>(
    initial?.status === "POSTED" || defaultStatus === "POSTED",
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Filtr kategórií podľa typu
  const availableCategories = useMemo(() => {
    if (!categories) return [];
    if (type === "INCOME") return categories.filter((c) => c.direction === "INCOME");
    return categories.filter((c) => c.direction === "EXPENSE");
  }, [categories, type]);

  // Validácia
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!accountId) e.account_id = "Vyberte účet";
    if (!categoryId) e.category_id = "Vyberte kategóriu";
    if (!type) e.type = "Vyberte typ";
    const num = parseFloat(amount);
    if (!amount || Number.isNaN(num) || num <= 0)
      e.amount_minor = "Zadajte platné množstvo (> 0 EUR)";
    if (!date) e.transaction_date = "Zadajte dátum";
    return e;
  }, [accountId, categoryId, type, amount, date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (Object.keys(errors).length > 0) return;

    const amountMinor = Math.round(parseFloat(amount) * 100);

    try {
      setLoading(true);

      // Dynamicky importujeme server action (relativna cesta z src/components)
      const { createTransactionAction } = await import(
        "@/app/dashboard/finance/actions"
      );

      const result = await createTransactionAction(
        null as never,
        {
          account_id: accountId,
          category_id: categoryId,
          type,
          amount_minor: amountMinor,
          transaction_date: date,
          document_number: documentNumber || null,
          description: description || null,
          status: post ? "POSTED" : "DRAFT",
        } as FinanceTransactionInsert,
      );

      if (!result.ok) {
        setSubmitError(result.message ?? "Neznáma chyba pri ukladaní.");
        return;
      }

      // Reset formulára
      setAmount("");
      setDocumentNumber("");
      setDescription("");
      setAccountId("");
      setCategoryId("");
      setPost(false);

      if (onSuccess) onSuccess();
      router.refresh();
    } catch {
      setSubmitError("Nepredvidnuta chyba pri odosielani formulara.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Nová transakcia" subtitle="Vložte dáta pre príjem alebo výdavok.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="acct">
              Účet
            </label>
            <select
              id="acct"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]/20"
              required
            >
              <option value="">– vyberte –</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
            {errors.account_id && (
              <p className="mt-1 text-xs text-red-600">{errors.account_id}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="type">
              Typ
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as "INCOME" | "EXPENSE")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]/20"
            >
              <option value="INCOME">Príjem (INCOME)</option>
              <option value="EXPENSE">Výdavok (EXPENSE)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="cat">
              Kategória ({type === "INCOME" ? "príjmov" : "výdavkov"})
            </label>
            <select
              id="cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]/20"
              required
            >
              <option value="">– vyberte –</option>
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            {errors.category_id && (
              <p className="mt-1 text-xs text-red-600">{errors.category_id}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="amt">
              Suma (EUR)
            </label>
            <input
              id="amt"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]/20"
              required
            />
            {errors.amount_minor && (
              <p className="mt-1 text-xs text-red-600">{errors.amount_minor}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="dt">
              Dátum
            </label>
            <input
              id="dt"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#C62828] focus:ring-2 focus:ring-[#C62828]/20"
              required
            />
            {errors.transaction_date && (
              <p className="mt-1 text-xs text-red-600">{errors.transaction_date}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="doc">
              Číslo dokumentu
            </label>
            <input
              id="doc"
              type="text"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="desc">
            Popis
          </label>
          <textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          ></textarea>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="post"
            type="checkbox"
            checked={post}
            onChange={(e) => setPost(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]"
          />
          <label
            htmlFor="post"
            className="text-sm font-medium text-gray-700"
          >
            Publikovať (POSTED) účtovanie
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled={loading}
            className="min-h-[44px]"
          >
            {loading ? "Ukladám…" : submitLabel}
          </Button>
          {initial?.id && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/dashboard/finance/transactions")}
              className="min-h-[44px]"
            >
              Zrušiť
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
