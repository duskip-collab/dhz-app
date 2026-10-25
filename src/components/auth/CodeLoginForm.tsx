"use client";

import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * CodeLoginForm – prihlásenie prístupovým kódom.
 * Kód vygeneruje administrátor/veliteľ a funguje ako heslo účtu.
 * Určené pre členov, ktorí nemajú e-mail v členskom profile.
 */
export function CodeLoginForm({
  resolveCodeAction,
}: {
  resolveCodeAction: (
    code: string
  ) => Promise<{ ok: true; email: string } | { ok: false; message: string }>;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const resolved = await resolveCodeAction(code.trim());
      if (!resolved.ok) {
        setError(resolved.message || "Neplatný prístupový kód.");
        return;
      }
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: resolved.email,
        password: code.trim(),
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
        <label htmlFor="login-code" className="block text-sm font-medium text-gray-700 mb-1.5">
          Prístupový kód
        </label>
        <div className="relative">
          <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            id="login-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="napr. K7X2-Q9P4"
            autoComplete="one-time-code"
            className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-300 font-mono uppercase tracking-widest text-center focus:ring-2 focus:ring-[#C62828] focus:border-transparent outline-none transition min-h-[48px]"
            required
          />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Kód vám vygeneruje administrátor alebo veliteľ v sekcii Administrácia.
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
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {loading ? "Prihlasujem…" : "Prihlásiť sa kódom"}
      </button>
    </form>
  );
}
