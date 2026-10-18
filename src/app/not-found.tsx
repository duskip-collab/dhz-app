import Link from "next/link";
import { Flame } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C62828] text-white mx-auto mb-5">
          <Flame className="w-8 h-8" />
        </div>
        <p className="text-sm font-bold text-[#C62828] uppercase tracking-wider">Chyba 404</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Stránka sa nenašla</h1>
        <p className="mt-2 text-sm text-gray-500">
          Odkaz, ktorý ste otvorili, neexistuje alebo bol presunutý. Vráťte sa na hlavný prehľad.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center mt-6 px-5 py-3 rounded-lg bg-[#C62828] text-white text-sm font-semibold hover:bg-[#8E0000] transition min-h-[44px]"
        >
          Späť na Domov
        </Link>
      </div>
    </div>
  );
}
