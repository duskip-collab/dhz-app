"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Settings, User } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import { clearOfflinePagesCache } from "@/components/pwa/offline-cache";

export function UserMenu({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // PWA (K13.4.1): offline cache RLS stránok sa nesmie preniesť na
    // ďalšieho používateľa zdieľaného zariadenia.
    await clearOfflinePagesCache();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Používateľské menu"
      >
        <Avatar name={userName} size={36} />
        <span className="hidden md:block text-sm font-semibold text-gray-900 max-w-[140px] truncate">
          {userName}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-900 truncate">{userName}</p>
              <p className="text-xs text-gray-500 truncate">{userEmail}</p>
            </div>
            <div className="p-1.5">
              <Link
                href="/profile"
                role="menuitem"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                <User className="w-4 h-4" /> Môj profil
              </Link>
              <Link
                href="/settings"
                role="menuitem"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                <Settings className="w-4 h-4" /> Nastavenia
              </Link>
              <Link
                href="/announcements"
                role="menuitem"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                <Bell className="w-4 h-4" /> Notifikácie
              </Link>
            </div>
            <div className="border-t border-gray-100 p-1.5">
              <button
                role="menuitem"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#C62828] hover:bg-red-50"
              >
                <LogOut className="w-4 h-4" /> Odhlásiť sa
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
