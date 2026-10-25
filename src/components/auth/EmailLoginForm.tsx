"use client";

import { useRouter } from "next/navigation";
import { Loader2, LogIn, Mail } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LoginResult = { ok: true } | { ok: false; message: string };

/**
 * EmailLoginForm – prihlásenie E-mail + heslo.
 * Pravidlo: povolené len pre hlavného administrátora a členov,
 * ktorí majú svoj e-mail explicitne zadaný v členskom profile.
 */
export function EmailLoginForm({
  checkEmailAction,
}: {
  checkEmailAction: (email: string) => Promise<LoginResult>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const check = await checkEmailAction(email.trim());
      if (!check.ok) {
        setError(
          check.message ||
            "E-mailové prihlásenie nie je pre tento účet povolené. Použite vygenerovaný prístupový kód – obráťte sa na administrátora alebo veliteľa."
        );
        return;
      }
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepodarilo sa prihlásiť.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1.5">
          Email
        </label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jan.novak@dhz.sk"
            className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#C62828] focus:border-transparent outline-none transition min-h-[48px]"
            required
            autoComplete="email"
          />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="login-password" className="text-sm font-medium text-gray-700">
            Heslo
          </label>
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-xs font-semibold text-gray-500 hover:text-[#C62828]"
          >
            {showPassword ? "Skryť" : "Zobraziť"}
          </button>
        </div>
        <input
          id="login-password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#C62828] focus:border-transparent outline-none transition min-h-[48px]"
          required
          autoComplete="current-password"
        />
      </div>
      <p className="text-xs text-gray-400">
        Prístup e-mailom majú hlavný administrátor a členovia s e-mailom zadaným v členskom
        profile. Ostatní použijú prístupový kód.
      </p>
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#C62828] px-4 font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {loading ? "Prihlasujem…" : "Prihlásiť sa"}
      </button>
    </form>
  );
}
