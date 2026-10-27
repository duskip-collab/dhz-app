"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const emailValue = formData.get("email") as string;
    const passwordValue = formData.get("password") as string;

    if (!emailValue || !passwordValue || !code) {
      setMessage({ type: "error", text: "Vyplňte všetky povinné polia." });
      return;
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue, password: passwordValue, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Registrácia zlyhala." });
        return;
      }

      setMessage({ type: "success", text: "Účet bol vytvorený. Teraz sa môžete prihlásiť." });
    } catch {
      setMessage({ type: "error", text: "Chyba pri registrácii." });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-md p-8">
        <Card className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Registrácia</h2>
          {message && (
            <div className={`mb-4 p-3 rounded text-sm ${
              message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}>
              {message.text}
            </div>
          )}
          <form action={handleSubmit as any} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="meno@príklad.sk"
                className="w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-[#C62828] focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Heslo</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className="w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-[#C62828] focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Pozývací kód</label>
              <input
                id="code"
                name="code"
                type="text"
                required
                value={code}
                readOnly
                className="w-full min-h-[44px] rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-center text-[#C62828]"
              />
            </div>
            <Button type="submit" className="w-full bg-[#C62828] text-white hover:bg-[#8E0000]">
              Vytvoriť účet a uplatniť kód
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-gray-400">
            Máte už účet?{" "}
            <Link href="/login" className="font-semibold text-[#C62828] hover:underline">
              Prihláste sa
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}