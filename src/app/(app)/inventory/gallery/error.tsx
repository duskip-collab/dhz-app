"use client";

import Link from "next/link";

export default function InventoryGalleryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <h1 className="text-lg font-bold text-red-900">Galériu sa nepodarilo načítať</h1>
      <p className="mt-2 text-sm text-red-800">
        Skontrolujte pripojenie a skúste načítanie zopakovať.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-lg bg-white px-4 text-sm font-semibold text-red-900 ring-1 ring-red-200 hover:bg-red-100"
        >
          Skúsiť znova
        </button>
        <Link
          href="/inventory"
          className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-gray-700 hover:bg-white"
        >
          Späť na Inventár a techniku
        </Link>
      </div>
    </section>
  );
}
