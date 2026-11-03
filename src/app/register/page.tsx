import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialCode = typeof params.code === "string" ? params.code : "";
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-md p-8">
        <Card className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Registrácia</h1>
          <RegisterForm initialCode={initialCode} />
        </Card>
        <p className="mt-6 text-center text-xs text-gray-400">
          Máte už účet?{" "}
          <Link href="/login" className="font-semibold text-[#C62828] hover:underline">
            Prihláste sa
          </Link>
        </p>
      </div>
    </main>
  );
}