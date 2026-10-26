"use client";

import { useActionState, useCallback, useState } from "react";
import {
  createIncomeAction,
  createExpenseAction,
  type CashbookActionState,
} from "@/app/(app)/finance/cashbook-actions";
import { formatMinor } from "@/lib/finance/finance-core";
import { Button } from "@/components/ui/Button";

interface CashBookFormProps {
  action: "income" | "expense";
  accounts: { id: string; name: string; type: string }[];
  categories: { id: string; name: string }[];
}
export function CashBookForm({ action, accounts, categories }: CashBookFormProps) {
  const serverAction = action === "income" ? createIncomeAction : createExpenseAction;
  const [state, formAction, pending] = useActionState(serverAction, null as CashbookActionState | null);
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
const allowedAccountNames = ["Bankový prevod", "Hotovosť"];
const filteredAccounts = accounts.filter((a) => allowedAccountNames.includes(a.name));
const accountOptions = filteredAccounts.length === 2 ? filteredAccounts : accounts;
const isIncome = action === "income";
const defaultAccountId =
  accountOptions.find((a) => a.name === "Bankový prevod")?.id ?? accountOptions[0]?.id ?? "";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-gray-900">
          {isIncome ? "+ Pridať príjem" : "− Pridať výdaj"}
        </h3>
      </div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="client_token" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cc-account" className="block text-xs font-semibold text-gray-500 mb-1">
              Účet
            </label>
            <select
              id="cc-account"
              name="account_id"
              required
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
            >
              <option value="">Vyberte účet</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cc-category" className="block text-xs font-semibold text-gray-500 mb-1">
              Kategória
            </label>
            <select
              id="cc-category"
              name="category_id"
              required
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
            >
              <option value="">Vyberte kategóriu</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="cc-date" className="block text-xs font-semibold text-gray-500 mb-1">
            Dátum
          </label>
          <input
            id="cc-date"
            name="transaction_date"
            type="date"
            required
            defaultValue={new Date().toISOString().split("T")[0]}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
        </div>
        <div>
          <label htmlFor="cc-amount" className="block text-xs font-semibold text-gray-500 mb-1">
            Suma (EUR)
          </label>
          <div className="relative">
            <input
              id="cc-amount"
              name="amount_minor"
              type="text"
              inputMode="decimal"
              required
              placeholder="0,00"
              className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
            />
            <span className="absolute left-3 top-2.5 text-xs text-gray-400">€</span>
          </div>
        </div>
        <div>
          <label htmlFor="cc-counterparty" className="block text-xs font-semibold text-gray-500 mb-1">
            {isIncome ? "Od koho" : "Komu / príjemca"}
          </label>
          <input
            id="cc-counterparty"
            name="counterparty"
            type="text"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
        </div>
        <div>
          <label htmlFor="cc-description" className="block text-xs font-semibold text-gray-500 mb-1">
            {isIncome ? "Za čo / účel" : "Účel / dôvod"}
          </label>
          <input
            id="cc-description"
            name="description"
            type="text"
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#C62828]"
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Ukladanie..." : isIncome ? "Uložiť príjem" : "Uložiť výdaj"}
          </Button>
        </div>
        {state && !state.ok && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]"
          >
            {state.message}
          </p>
        )}
        {state?.ok && (
          <p
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
