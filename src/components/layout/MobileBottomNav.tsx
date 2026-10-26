"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  FileText,
  Home,
  Trophy,
  User,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/client";
import { PERMISSIONS } from "@/lib/auth/permissions";

const TABS = [
  {
    label: "Domov",
    href: "/dashboard",
    icon: Home,
    permission: PERMISSIONS.DASHBOARD_VIEW,
  },
  {
    label: "Kalendár",
    href: "/calendar",
    icon: CalendarDays,
    permission: PERMISSIONS.CALENDAR_VIEW,
  },
  {
    label: "Oznámenia",
    href: "/announcements",
    icon: Bell,
    permission: PERMISSIONS.COMMUNICATION_VIEW,
  },
  {
    label: "Financie",
    href: "/finance/cashbook",
    icon: WalletCards,
    permission: PERMISSIONS.FINANCE_VIEW,
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { permissions } = useAuth();

  const visibleTabs = TABS.filter(
    (tab) => !tab.permission || permissions.includes(tab.permission),
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
            gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))`,
          }}
        >
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium min-h-[56px] ${active ? "text-[#C62828]" : "text-gray-500"}`}
              >
                <Icon className="w-5 h-5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}