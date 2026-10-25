"use client";

import Link from "next/link";
import { Home, WalletCards, X } from "lucide-react";
import { NAV_SECTIONS, filterNavByPermissions } from "@/config/navigation";

interface MobileFullMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  permissions: string[];
}

export function MobileFullMenuDrawer({
  isOpen,
  onClose,
  permissions,
}: MobileFullMenuDrawerProps) {
  const visibleSections = filterNavByPermissions(NAV_SECTIONS, permissions);

  return (
    <div
      className={isOpen ? "fixed inset-0 z-50" : "hidden"}
      role="dialog"
      aria-modal="true"
      aria-label="Hlavné menu"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className="fixed inset-0 z-50 flex flex-col max-w-full w-full bg-white rounded-t-xl shadow-2xl transform transition-transform duration-300"
        style={{ transform: isOpen ? "translateY(0)" : "translateY(-100%)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 left-3 p-2 rounded-lg hover:bg-gray-100 transition"
          aria-label="Zavrieť menu"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex-shrink-0 h-16 border-b border-gray-200 bg-[#F5F6F8]">
          <div className="flex items-center justify-between px-6">
            <h2 className="font-bold text-xl text-gray-900">DHZ Digital OS</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100"
              aria-label="Zavrieť"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto pb-6">
          {visibleSections.map((section) => (
            <div key={section.label} className="px-4 py-3">
              <p className="px-3 mb-2 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
                {section.label}
              </p>
              <ul className="space-y-1 px-3">
                {section.items.map((item) => {
                  const isActive = item.href === "/" || item.href === "/dashboard";
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-red-50 text-[#C62828]" : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"}`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <item.icon className="w-5 h-5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Quick access bottom */}
        <div className="p-4 border-t border-gray-200 bg-[#F5F6F8]">
          <p className="text-xs text-gray-400 mb-2">Rýchly prístup</p>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/dashboard"
              className="flex-1 rounded-lg border border-gray-200 p-3 text-center text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              aria-label="Domov"
            >
              <Home className="w-4 h-4 mx-auto mb-1" />
              Domov
            </Link>
            <Link
              href="/finance/cashbook"
              className="flex-1 rounded-lg border border-gray-200 p-3 text-center text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              aria-label="Pokladňa"
            >
              <WalletCards className="w-4 h-4 mx-auto mb-1" />
              Pokladňa
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}