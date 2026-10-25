"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Menu, X } from "lucide-react";

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: {
    label: string;
    onClick: () => void;
    variant?: "secondary" | "destructive";
  };
}

export function PageHeader({ title, showBack = true, rightAction }: PageHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const showBackButton = showBack && pathname !== "/" && pathname !== "/dashboard";

  return (
    <header className="border-b border-gray-200 bg-white px-4 sm:px-6 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-3">
          {showBackButton && (
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg hover:bg-gray-100 transition"
              aria-label="Späť"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="font-semibold text-lg text-gray-900 truncate">{title}</h1>
        </div>

        {/* Right action button */}
        {rightAction && (
          <button
            onClick={rightAction.onClick}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: rightAction.variant === "destructive" ? "#fee2e2" : "#F5F6F8",
              color: rightAction.variant === "destructive" ? "#C62828" : "#C53030",
            }}
            aria-label={rightAction.label}
          >
            <span className="font-medium">{rightAction.label}</span>
          </button>
        )}
      </div>
    </header>
  );
}