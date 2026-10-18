"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Flame, LogOut } from "lucide-react";
import { NAV_SECTIONS, filterNavByPermissions } from "@/config/navigation";
import { Avatar } from "@/components/ui/Avatar";

export function Sidebar({
  permissions,
  userName,
  userEmail,
  onLogout,
}: {
  permissions: string[];
  userName: string;
  userEmail: string;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);
  const sections = filterNavByPermissions(NAV_SECTIONS, permissions);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <aside className="hidden lg:flex w-72 shrink-0 flex-col bg-white border-r border-gray-200 h-screen sticky top-0">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-gray-200">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#C62828] text-white">
          <Flame className="w-6 h-6" />
        </div>
        <div>
          <p className="text-base font-bold text-gray-900 leading-tight">DHZ Digital OS</p>
          <p className="text-xs text-gray-500 leading-tight">Dobrovoľný hasičský zbor</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Hlavná navigácia">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-2 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                // isActive je false počas SSR a prvotného renderu klienta (zabezpečuje zhodu)
                const isActive = isMounted && (pathname === item.href || pathname.startsWith(item.href + "/"));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                        isActive
                          ? "bg-red-50 text-[#C62828] border border-red-100"
                          : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={userName} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
            <p className="text-xs text-gray-500 truncate">{userEmail}</p>
          </div>
          <button
            onClick={onLogout}
            className="p-2 rounded-lg text-gray-400 hover:text-[#C62828] hover:bg-red-50 transition"
            aria-label="Odhlásiť sa"
            title="Odhlásiť sa"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}