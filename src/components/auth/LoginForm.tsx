"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Flame, Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
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
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
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
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-[#C62828] text-white shadow-sm mx-auto mb-4">
          <Flame className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">DHZ Digital OS</h1>
        <p className="text-sm text-gray-500 mt-1">Digitálny organizačný systém dobrovoľného hasičského zboru</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="email"
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
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              Heslo
            </label>
            <span className="text-sm text-gray-400">Zabudnuté heslo rieši administrátor</span>
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-12 pr-12 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#C62828] focus:border-transparent outline-none transition min-h-[48px]"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 transition"
              aria-label={showPassword ? "Skryť heslo" : "Zobraziť heslo"}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-[#C62828] px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#C62828] text-white py-3 rounded-lg font-semibold hover:bg-[#8E0000] transition focus:ring-2 focus:ring-[#C62828] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
        >
          {loading ? "Prihlasujem…" : "Prihlásiť sa"}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-gray-400">
        Prístupové údaje vydáva administrátor zboru. Registrácia nie je verejná.
      </p>
    </div>
  );
}
