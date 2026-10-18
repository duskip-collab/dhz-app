"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

export function TopBar({ userName, userEmail }: { userName: string; userEmail: string }) {
  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between h-16 px-4">
        <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="DHZ Digital OS – domov">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#C62828] text-white">
            <Flame className="w-5 h-5" />
          </div>
          <span className="text-base font-bold text-gray-900">DHZ Digital OS</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell count={0} />
          <UserMenu userName={userName} userEmail={userEmail} />
        </div>
      </div>
    </header>
  );
}

export function DesktopTopBar({ userName, userEmail }: { userName: string; userEmail: string }) {
  return (
    <header className="hidden lg:flex sticky top-0 z-20 bg-[#F5F6F8]/80 backdrop-blur border-b border-gray-200">
      <div className="flex items-center justify-end gap-2 h-16 px-6 w-full">
        <NotificationBell count={0} />
        <UserMenu userName={userName} userEmail={userEmail} />
      </div>
    </header>
  );
}
