"use client";

import { useState } from "react";
import { Flame, KeyRound, Mail } from "lucide-react";
import { EmailLoginForm } from "@/components/auth/EmailLoginForm";
import { CodeLoginForm } from "@/components/auth/CodeLoginForm";
import { checkEmailLoginAllowed, resolveAccessCodeEmail } from "@/lib/auth/login-actions";

/**
 * LoginPanel – prihlasovanie do DHZ Digital OS.
 * Režim 1: E-mail a heslo (admin + členovia s e-mailom v profile).
 * Režim 2: Prístupový kód (členovia bez e-mailu v profile).
 */
export function LoginPanel() {
  const [mode, setMode] = useState<"email" | "code">("email");

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
      <div className="text-center mb-2">
        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-[#C62828] text-white shadow-sm mx-auto mb-4">
          <Flame className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">DHZ Digital OS</h1>
        <p className="text-sm text-gray-500 mt-1">Digitálny organizačný systém dobrovoľného hasičského zboru</p>
      </div>

      <div className="mt-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setMode("email")}
          className={`flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
            mode === "email" ? "bg-white text-[#C62828] shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Mail className="h-4 w-4" /> E-mail a heslo
        </button>
        <button
          type="button"
          onClick={() => setMode("code")}
          className={`flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
            mode === "code" ? "bg-white text-[#C62828] shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <KeyRound className="h-4 w-4" /> Prístupový kód
        </button>
      </div>

      {mode === "email" ? (
        <EmailLoginForm checkEmailAction={checkEmailLoginAllowed} />
      ) : (
        <CodeLoginForm resolveCodeAction={resolveAccessCodeEmail} />
      )}

      <p className="mt-6 text-center text-xs text-gray-400">
        Zabudnuté heslo alebo kód rieši administrátor alebo veliteľ.
      </p>
    </div>
  );
}
