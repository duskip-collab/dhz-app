"use client";

import { useActionState, useCallback, useState } from "react";
import { createTransferAction } from "@/app/dashboard/finance/actions";
import type { FinanceActionState } from "@/app/dashboard/finance/actions";
import { Button } from "@/components/ui/Button";

interface TransferFormProps {
  accounts: { id: string; name: string }[];
  onSuccess?: () => void;
}

export function TransferForm({ accounts, onSuccess }: TransferFormProps) {
  const [serverActionState, formAction, pending] = useActionState<FinanceActionState | null>(createTransferAction as any, null);

  const [formData, setFormData] = useState({
    fromAccountId: "",
    toAccountId: "",
    amountMinor: "",
    transactionDate: new Date().toISOString().split("T")[0],
    description: "",
    post: "true",
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void formAction();
    },
    [formAction],
  );
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Prevod medzi účtami</h3>
      <form action={formAction} onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tf-from" className="block text-xs font-semibold text-gray-500 mb-1">
              Od účtu
            </label>
            <select
              id="tf-from"
              name="fromAccountId"
              required
              defaultValue={formData.fromAccountId}
              onChange={(e) => setFormData({ ...formData, fromAccountId: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
            >
              <option value="">Vyberte účet</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tf-to" className="block text-xs font-semibold text-gray-500 mb-1">
              Na účet
            </label>
            <select
              id="tf-to"
              name="toAccountId"
              required
              defaultValue={formData.toAccountId}
              onChange={(e) => setFormData({ ...formData, toAccountId: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
            >
              <option value="">Vyberte účet</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="tf-date" className="block text-xs font-semibold text-gray-500 mb-1">
            Dátum
          </label>
          <input
            id="tf-date"
            name="transactionDate"
            type="date"
            required
            defaultValue={formData.transactionDate}
            onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
        </div>
        <div>
          <label htmlFor="tf-amount" className="block text-xs font-semibold text-gray-500 mb-1">
            Suma (EUR)
          </label>
          <div className="relative">
            <input
              id="tf-amount"
              name="amountMinor"
              type="text"
              inputMode="decimal"
              required
              defaultValue={formData.amountMinor}
              onChange={(e) => setFormData({ ...formData, amountMinor: e.target.value })}
              placeholder="0,00"
              className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
            />
            <span className="absolute left-3 top-2.5 text-xs text-gray-400">€</span>
          </div>
        </div>
        <div>
          <label htmlFor="tf-desc" className="block text-xs font-semibold text-gray-500 mb-1">
            Popis (voliteľné)
          </label>
          <input
            id="tf-desc"
            name="description"
            type="text"
            defaultValue={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="tf-post"
            name="post"
            type="checkbox"
            defaultChecked={formData.post === "true"}
            onChange={(e) => setFormData({ ...formData, post: e.target.checked ? "true" : "false" })}
            className="rounded border-gray-300 bg-[#C62828] text-[#C62828] focus:ring-[#C62828]"
          />
          <label htmlFor="tf-post" className="text-sm text-gray-600">
            Zaúčtovať ihneď (POSTED)
          </label>
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
            Prevod bol vytvorený.
          </p>
        )}

        <div className="flex gap-2 mt-4">
          <Button type="submit" disabled={pending}>
            Vytvoriť prevod
          </Button>
          <Button type="button" onClick={() => onSuccess?.()}>
            Zrušiť
          </Button>
        </div>
      </form>
    </div>
  );
}