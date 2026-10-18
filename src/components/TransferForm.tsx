// Formulár pre vytvorenie prevodu (prenosu) peňažeria medzi dvoma účtami.
// Volaním server action `createTransferAction` cez RPC
// `public.finance_create_transfer`, ktorý asynchrónne vytvorí dva riadky
// v `finance_transactions` (TRANSFER_OUT z zdroja a TRANSFER_IN do cieľa).

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { FinanceAccountsRow } from "@/types/database.types";

// =============================================================================
// Props
// =============================================================================

export interface TransferFormProps {
  /** Všetky aktívne účty (pre selecty z/ceľ) */
  accounts: FinanceAccountsRow[];
  /** Počiatočné hodnoty (pre editovanie), prípadne `null` na nový prevod */
  initial?: {
    fromAccountId?: string;
    toAccountId?: string;
    amountMinor?: number;
    transactionDate?: string;
    documentNumber?: string | null;
    description?: string | null;
    post?: boolean;
  };
  submitLabel?: string;
  onSuccess?: () => void;
}

// =============================================================================
// Komponent
// =============================================================================

export function TransferForm({
  accounts,
  initial,
  submitLabel = "Vytvoriť prevod",
  onSuccess,
}: TransferFormProps) {
  const router = useRouter();

  const [fromId, setFromId] = useState<string>(initial?.fromAccountId ?? "");
  const [toId, setToId] = useState<string>(initial?.toAccountId ?? "");
  const [amount, setAmount] = useState<string>(initial?.amountMinor?.toString() ?? "");
  const [date, setDate] = useState<string>(
    initial?.transactionDate
      ? initial.transactionDate.split("T")[0]
      : new Date().toISOString().split("T")[0],
  );
  const [documentNumber, setDocumentNumber] = useState<string>(initial?.documentNumber ?? "");
  const [description, setDescription] = useState<string>(initial?.description ?? "");
  const [post, setPost] = useState<boolean>(initial?.post ?? false);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Validácia
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!fromId) e.from_account_id = "Vyberte zdrojový účet";
    if (!toId) e.to_account_id = "Vyberte cieľový účet";
    const num = parseFloat(amount);
    if (!amount || Number.isNaN(num) || num <= 0)
      e.amount_minor = "Zadajte platné množstvo (> 0 EUR)";
    if (!date) e.transaction_date = "Zadajte dátum";
    if (fromId && toId && fromId === toId)
      e.to_account_id = "Zdrojový a cieľový účet nesmú byť rovnaké";
    return e;
  }, [fromId, toId, amount, date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (Object.keys(errors).length > 0) return;

    const amountMinor = Math.round(parseFloat(amount) * 100);

    try {
      setLoading(true);

      // Dynamicky importujeme server action (alias cesta)
      const { createTransferAction } = await import(
        "@/app/dashboard/finance/actions"
      );

      const result = await createTransferAction({
        fromAccountId: fromId,
        toAccountId: toId,
        amountMinor,
        transactionDate: date,
        documentNumber: documentNumber || null,
        description: description || null,
        post,
      });

      if (!result.ok) {
        setSubmitError(result.message ?? "Neznáma chyba pri vytváraní prevodu.");
        return;
      }

      // Reset formulára
      setAmount("");
      setDocumentNumber("");
      setDescription("");
      setFromId("");
      setToId("");
      setPost(false);

      if (onSuccess) onSuccess();
      router.refresh();
    } catch {
      setSubmitError("Nepredvidnuta chyba pri odosielani formulara.");
    } finally {
      setLoading(false);
    }
  };

  const fromAccount = accounts.find((a) => a.id === fromId);
  const toAccount = accounts.find((a) => a.id === toId);

  return (
    <Card title="Prevod peňažeria" subtitle="Presunúť finančné prostriedky medzi dvoma účtami.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fromAcct">
              Zdrojový účet
            </label>
            <select
              id="fromAcct"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
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
            {errors.from_account_id && (
              <p className="mt-1 text-xs text-red-600">{errors.from_account_id}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="toAcct">
              Cieľový účet
            </label>
            <select
              id="toAcct"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
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
            {errors.to_account_id && (
              <p className="mt-1 text-xs text-red-600">{errors.to_account_id}</p>
            )}
          </div>
        </div>

        {fromAccount && toAccount && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{fromAccount.name}</span>
            {" → "}
            <span className="font-semibold text-gray-900">{toAccount.name}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="desc">
            Popis
          </label>
          <textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          ></textarea>
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

        <div className="flex items-center gap-2">
          <input
            id="transPost"
            type="checkbox"
            checked={post}
            onChange={(e) => setPost(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]"
          />
          <label
            htmlFor="transPost"
            className="text-sm font-medium text-gray-700"
          >
            Publikovať (POSTED) správne
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled={loading}
            className="min-h-[44px]"
          >
            {loading ? "Vytváram…" : submitLabel}
          </Button>
          {initial?.fromAccountId && (
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
