"use client";

import { Bell } from "lucide-react";

// Pripravené na napojenie: notifications + Supabase Realtime + Push.
// Zatiaľ statický placeholder s počtom 0.
export function NotificationBell({ count = 0 }: { count?: number }) {
  return (
    <button
      className="relative p-2.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
      aria-label={count > 0 ? `${count} neprečítaných oznámení` : "Žiadne nové oznámenia"}
      title="Oznámenia"
    >
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#C62828] text-white text-[11px] font-bold">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
