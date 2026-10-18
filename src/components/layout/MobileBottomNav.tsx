"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  FileText,
  Home,
  Trophy,
  User,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/client";
import { PERMISSIONS } from "@/lib/auth/permissions";

const QUICK_ACTIONS = [
  { label: "Pridať člena", href: "/members", icon: Users, permission: PERMISSIONS.MEMBERS_CREATE },
  { label: "Pridať tréning", href: "/training", icon: Dumbbell, permission: PERMISSIONS.TRAINING_CREATE },
  { label: "Pridať súťaž", href: "/competitions", icon: Trophy, permission: PERMISSIONS.COMPETITION_CREATE },
  { label: "Pridať poradu", href: "/meetings", icon: ClipboardList, permission: PERMISSIONS.CALENDAR_MANAGE },
  { label: "Nahlásiť poruchu", href: "/faults", icon: AlertTriangle, permission: PERMISSIONS.FAULT_CREATE },
  { label: "Pridať dokument", href: "/documents", icon: FileText, permission: PERMISSIONS.DOCUMENTS_UPLOAD },
];

const TABS = [
  { label: "Domov", href: "/dashboard", icon: Home, permission: PERMISSIONS.DASHBOARD_VIEW },
  { label: "Kalendár", href: "/calendar", icon: CalendarDays, permission: PERMISSIONS.CALENDAR_VIEW },
  { label: "Oznámenia", href: "/announcements", icon: Bell, permission: PERMISSIONS.COMMUNICATION_VIEW },
  { label: "Profil", href: "/profile", icon: User },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { permissions } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const visibleTabs = TABS.filter(
    (tab) => !tab.permission || permissions.includes(tab.permission),
  );
  const visibleQuickActions = QUICK_ACTIONS.filter(
    (action) => !action.permission || permissions.includes(action.permission),
  );

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200"
        aria-label="Mobilná navigácia"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div
          className="grid h-16"
          style={{
            gridTemplateColumns: `repeat(${visibleTabs.length + Number(visibleQuickActions.length > 0)}, minmax(0, 1fr))`,
          }}
        >
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium min-h-[56px] ${
                  active ? "text-[#C62828]" : "text-gray-500"
                }`}
              >
                <Icon className="w-5 h-5" />
                {t.label}
              </Link>
            );
          })}
          {visibleQuickActions.length > 0 ? (
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center justify-center"
              aria-label="Rýchle akcie"
            >
              <span className="flex items-center justify-center w-12 h-12 -mt-6 rounded-full bg-[#C62828] text-white shadow-lg text-2xl font-light leading-none">
                +
              </span>
            </button>
          ) : null}
        </div>
      </nav>

      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Rýchle akcie">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-4 pb-8 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-gray-900">Rýchle akcie</p>
              <button
                onClick={() => setSheetOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Zavrieť"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {visibleQuickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <Link
                    key={a.label}
                    href={a.href}
                    onClick={() => setSheetOpen(false)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 active:bg-gray-50"
                  >
                    <span className="w-9 h-9 rounded-lg bg-red-50 text-[#C62828] flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </span>
                    {a.label}
                  </Link>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 text-center mt-4">
              DEMO – akcie zatiaľ vedú na placeholder modulu.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
