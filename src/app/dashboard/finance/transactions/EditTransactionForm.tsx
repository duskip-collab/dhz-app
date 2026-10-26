"use client";

import { useActionState, useCallback, useState } from "react";
import { updateTransactionAction } from "@/app/dashboard/finance/actions";
import type { FinanceActionState } from "@/app/dashboard/finance/actions";
import { Button } from "@/components/ui/Button";
import { formatMinor } from "@/lib/finance/finance-core";

interface EditTransactionFormProps {
  transaction: {
    id: string;
    account_id: string;
    category_id: string | null;
    type: string;
    status: string;
    amount_minor: number;
    transaction_date: string;
    description: string | null;
    counterparty: string | null;
    document_number: string | null;
  };
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  onSuccess?: () => void;
  onClose?: () => void;
}

export function EditTransactionForm({
  transaction,
  accounts,
  categories,
  onSuccess,
  onClose,
}: EditTransactionFormProps) {
  const isDraft = transaction.status === "DRAFT";
  const [serverActionState, formAction, pending] = useActionState<FinanceActionState | null>(updateTransactionAction as any, null);

  const [formData, setFormData] = useState({
    amount_minor: transaction.amount_minor,
    transaction_date: transaction.transaction_date,
    description: transaction.description ?? "",
    counterparty: transaction.counterparty ?? "",
    category_id: transaction.category_id ?? "",
    document_number: transaction.document_number ?? "",
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void formAction();
    },
    [formAction],
  );

    if (!isDraft) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Úprava transakcie</h3>
        <div className="rounded-lg border border-gray-200 bg-amber-50 p-4 mb-4">
          <p className="text-sm text-amber-800">
            Táto transakcia je v stave <strong>{transaction.status}</strong> a nie je možné ju editovať.
            Zaúčtované (POSTED) transakcie je možné iba stornovať.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={onClose}>
            Zavrieť
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Úprava transakcie (DRAFT)</h3>
      <form action={formAction} onSubmit={handleSubmit} className="space-y-3">
        <input type="hidden" name="id" defaultValue={transaction.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-account" className="block text-xs font-semibold text-gray-500 mb-1">
              Účet
            </label>
            <select
              id="edit-account"
              name="account_id"
              required
              defaultValue={transaction.account_id}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit-category" className="block text-xs font-semibold text-gray-500 mb-1">
              Kategória
            </label>
            <select
              id="edit-category"
              name="category_id"
              required
              defaultValue={transaction.category_id ?? ""}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
            >
              <option value="">Vyberte kategóriu</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="edit-date" className="block text-xs font-semibold text-gray-500 mb-1">
            Dátum
          </label>
          <input
            id="edit-date"
            name="transaction_date"
            type="date"
            required
            defaultValue={transaction.transaction_date}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
        </div>
        <div>
          <label htmlFor="edit-amount" className="block text-xs font-semibold text-gray-500 mb-1">
            Suma (EUR)
          </label>
          <div className="relative">
            <input
              id="edit-amount"
              name="amount_minor"
              type="text"
              inputMode="decimal"
              required
              defaultValue={formatMinor(transaction.amount_minor).replace(" €", "")}
              placeholder="0,00"
              className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
            />
            <span className="absolute left-3 top-2.5 text-xs text-gray-400">€</span>
          </div>
        </div>
        <div>
          <label htmlFor="edit-description" className="block text-xs font-semibold text-gray-500 mb-1">
            Popis
          </label>
          <input
            id="edit-description"
            name="description"
            type="text"
            required
            defaultValue={formData.description}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
        </div>
        <div>
          <label htmlFor="edit-counterparty" className="block text-xs font-semibold text-gray-500 mb-1">
            Protistrana (voliteľné)
          </label>
          <input
            id="edit-counterparty"
            name="counterparty"
            type="text"
            defaultValue={formData.counterparty}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
        </div>
        <div>
          <label htmlFor="edit-document" className="block text-xs font-semibold text-gray-500 mb-1">
            Číslo dokladu (voliteľné)
          </label>
          <input
            id="edit-document"
            name="document_number"
            type="text"
            defaultValue={formData.document_number}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
        </div>

        {serverActionState && !serverActionState.ok && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]"
          >
            {serverActionState.message}
          </p>
        )}
        {serverActionState?.ok && (
          <p
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            Transakcia bola aktualizovaná.
          </p>
        )}

        <div className="flex gap-2 mt-4">
          <Button type="submit" disabled={pending}>
            Uložiť zmeny
          </Button>
          <Button type="button" onClick={onClose}>
            Zrušiť
          </Button>
        </div>
      </form>
    </div>
  );
}