import type { Metadata } from "next";
import { Flame } from "lucide-react";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { formatInvitationCodeInput } from "@/lib/auth/invitations.share";

export const metadata: Metadata = {
  title: "Registrácia",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
  // Kód sa normalizuje ešte pred vykreslením – do stavu aplikácie sa dostáva
  // už vo formáte XXXX-XXXX-XXXX.
  const initialCode = rawCode ? formatInvitationCodeInput(rawCode) : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 py-10">
      <div className="w-full max-w-md p-6 sm:p-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#C62828] text-white shadow-sm">
              <Flame className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">DHZ Digital OS</h1>
            <p className="mt-1 text-sm text-gray-500">
              Registrácia nového člena s pozývacím kódom
            </p>
          </div>

          <RegisterForm initialCode={initialCode} />
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Pozývací kód vám poskytne administrátor zboru.
        </p>
      </div>
    </div>
  );
}
