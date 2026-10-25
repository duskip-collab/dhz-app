import Link from "next/link";
import { LoginPanel } from "@/components/auth/LoginPanel"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-md p-8">
        <LoginPanel />
        <p className="mt-6 text-center text-xs text-gray-400">
          Máte pozývací kód?{" "}
          <Link href="/register" className="font-semibold text-[#C62828] hover:underline">
            Zaregistrujte sa
          </Link>
        </p>
      </div>
    </div>
  )
}