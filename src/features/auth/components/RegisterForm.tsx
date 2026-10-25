"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck, UserPlus } from "lucide-react";
import {
  acceptInvitationAction,
  verifyInvitationCodeAction,
  type VerifyCodeState,
} from "@/app/(auth)/register/actions";
import { formatInvitationCodeInput } from "@/lib/auth/invitations.share";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

interface InvitationCodeFieldProps {
  code: string;
  onChange: (value: string) => void;
  verifying: boolean;
  verification: VerifyCodeState | null;
  complete: boolean;
}

function InvitationCodeField({
  code,
  onChange,
  verifying,
  verification,
  complete,
}: InvitationCodeFieldProps) {
  return (
    <div>
      <label htmlFor="register-code" className="block text-sm font-medium text-gray-700 mb-1.5">
        Pozývací kód
      </label>
      <div className="relative">
        <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          id="register-code"
          type="text"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          required
          autoComplete="one-time-code"
          spellCheck={false}
          className="w-full pl-12 pr-12 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#C62828] focus:border-transparent outline-none transition min-h-[48px] font-mono tracking-widest uppercase"
        />
        {verifying ? (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        ) : null}
      </div>

      {verification ? (
        verification.ok ? (
          <p
            role="status"
            className="mt-2 flex items-start gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Kód je platný. Po registrácii vám bude priradená rola: {verification.roleLabel}.
            </span>
          </p>
        ) : (
          <p
            role="alert"
            className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#C62828]"
          >
            {verification.message}
          </p>
        )
      ) : complete ? null : (
        <p className="mt-2 text-xs text-gray-400">Kód má formát XXXX-XXXX-XXXX (12 znakov).</p>
      )}
    </div>
  );
}

export function RegisterForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [code, setCode] = useState(initialCode);

  const [verification, setVerification] = useState<VerifyCodeState | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kód z URL sa po prečítaní odstráni z adresnej lišty (kód nemá zostať v URL).
  useEffect(() => {
    if (!initialCode) return;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("code")) return;
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url.toString());
  }, [initialCode]);

  // Detekcia existujúcej session (uplatnenie kódu po prihlásení).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setHasSession(Boolean(data.session));
      } catch {
        if (!cancelled) setHasSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runVerification = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setVerification(null);
      return;
    }
    setVerifying(true);
    try {
      const result = await verifyInvitationCodeAction(trimmed);
      setVerification(result);
    } catch {
      setVerification({ ok: false, message: "Overenie kódu zlyhalo. Skúste to znova." });
    } finally {
      setVerifying(false);
    }
  }, []);

  // Inline overenie platnosti kódu (debounce).
  useEffect(() => {
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
    verifyTimer.current = setTimeout(() => {
      void runVerification(code);
    }, 500);
    return () => {
      if (verifyTimer.current) clearTimeout(verifyTimer.current);
    };
  }, [code, runVerification]);

  const codeLooksComplete = useMemo(() => code.replace(/-/g, "").length === 12, [code]);

  function handleCodeChange(value: string) {
    setCode(formatInvitationCodeInput(value));
    setError(null);
  }


  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setClaiming(true);
    setError(null);
    setInfo(null);
    try {
      const result = await acceptInvitationAction(code);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setInfo(result.message);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Uplatnenie kódu zlyhalo. Skúste to znova.");
    } finally {
      setClaiming(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Zadajte e-mailovú adresu.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Heslo musí mať aspoň ${MIN_PASSWORD_LENGTH} znakov.`);
      return;
    }
    if (password !== passwordConfirm) {
      setError("Heslá sa nezhodujú.");
      return;
    }
    if (!codeLooksComplete) {
      setError("Zadajte platný pozývací kód.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (signUpError) {
        setError(
          signUpError.message.toLowerCase().includes("already registered")
            ? "Účet s týmto e-mailom už existuje. Prihláste sa."
            : "Registrácia zlyhala. Skúste to znova.",
        );
        return;
      }

      // Session existuje iba pri vypnutom potvrdzovaní e-mailu.
      if (!data.session) {
        setInfo(
          "Účet bol vytvorený. Potvrďte e-mail a prihláste sa. Následne sa opätovne otvorte tento odkaz s pozývacím kódom – kód vám priradí rolu.",
        );
        return;
      }

      const claim = await acceptInvitationAction(code);
      if (!claim.ok) {
        setError(claim.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Registrácia zlyhala. Skúste to znova.");
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <div className="space-y-5">
      {hasSession ? (
        <form onSubmit={handleClaim} className="space-y-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">Uplatniť pozývací kód</h2>
            <p className="mt-1 text-sm text-gray-500">
              Už ste prihlásený – zadajte pozývací kód a rola bude priradená vášmu účtu.
            </p>
          </div>

          <InvitationCodeField
            code={code}
            onChange={handleCodeChange}
            verifying={verifying}
            verification={verification}
            complete={codeLooksComplete}
          />

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]"
            >
              {error}
            </p>
          ) : null}
          {info ? (
            <p
              role="status"
              className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
            >
              {info}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={claiming}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#C62828] px-4 font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50"
          >
            {claiming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {claiming ? "Uplatňujem…" : "Uplatniť kód"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">Registrácia s pozývacím kódom</h2>
            <p className="mt-1 text-sm text-gray-500">
              Na vytvorenie účtu potrebujete platný jednorazový pozývací kód.
            </p>
          </div>

          <div>
            <label
              htmlFor="register-email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jan.novak@dhz.sk"
                required
                autoComplete="email"
                className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#C62828] focus:border-transparent outline-none transition min-h-[48px]"
              />
            </div>
          </div>


          <div>
            <label
              htmlFor="register-password"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Heslo
            </label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#C62828] focus:border-transparent outline-none transition min-h-[48px]"
            />
            <p className="mt-1 text-xs text-gray-400">Minimálne {MIN_PASSWORD_LENGTH} znakov.</p>
          </div>

          <div>
            <label
              htmlFor="register-password-confirm"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Potvrdenie hesla
            </label>
            <input
              id="register-password-confirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="••••••••"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#C62828] focus:border-transparent outline-none transition min-h-[48px]"
            />
          </div>

          <InvitationCodeField
            code={code}
            onChange={handleCodeChange}
            verifying={verifying}
            verification={verification}
            complete={codeLooksComplete}
          />

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C62828]"
            >
              {error}
            </p>
          ) : null}
          {info ? (
            <p
              role="status"
              className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
            >
              {info}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#C62828] px-4 font-semibold text-white shadow-sm transition hover:bg-[#8E0000] disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {submitting ? "Registrujem…" : "Zaregistrovať sa"}
          </button>
        </form>
      )}
    </div>
  );
}

