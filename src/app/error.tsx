"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center px-4">
      <div className="text-center max-w-md bg-white rounded-xl border border-gray-200 shadow-sm p-8">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-50 text-[#C62828] mx-auto mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Niečo sa pokazilo</h1>
        <p className="mt-2 text-sm text-gray-500">
          Pri načítaní stránky nastala neočakávaná chyba. Skúste to znova, alebo sa vráťte na hlavný prehľad.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-lg bg-[#C62828] text-white text-sm font-semibold hover:bg-[#8E0000] transition min-h-[44px]"
          >
            Skúsiť znova
          </button>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg bg-white border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition min-h-[44px] inline-flex items-center justify-center"
          >
            Späť na Domov
          </Link>
        </div>
      </div>
    </div>
  );
}
