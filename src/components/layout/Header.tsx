import Link from "next/link";
import { Flame } from "lucide-react";

export function Header() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-3 group"
              aria-label="DHZ Digital OS – domov"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-600 text-white shadow-sm">
                <Flame className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-gray-900 leading-tight">
                  DHZ Digital OS
                </span>
                <span className="text-xs text-gray-500 font-normal leading-tight hidden sm:inline">
                  {" "}
                  · Digitálny organizačný systém
                </span>
              </div>
            </Link>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-gray-700 hover:text-red-600 px-3 py-2 rounded-md hover:bg-gray-50"
            >
              Domov
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-gray-700 hover:text-red-600 px-3 py-2 rounded-md hover:bg-gray-50"
            >
              Prehľad
            </Link>
            <Link
              href="/members"
              className="text-sm font-medium text-gray-700 hover:text-red-600 px-3 py-2 rounded-md hover:bg-gray-50"
            >
              Členovia
            </Link>
            <Link
              href="/training"
              className="text-sm font-medium text-gray-700 hover:text-red-600 px-3 py-2 rounded-md hover:bg-gray-50"
            >
              Tréning
            </Link>
            <Link
              href="/calendar"
              className="text-sm font-medium text-gray-700 hover:text-red-600 px-3 py-2 rounded-md hover:bg-gray-50"
            >
              Kalendár
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}