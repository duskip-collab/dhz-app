"use client";

import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar, DesktopTopBar } from "./TopBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileFullMenuDrawer } from "../navigation/MobileFullMenuDrawer";
import { AuthProvider } from "@/lib/auth/client";
import { createClient } from "@/lib/supabase/client";
import { clearOfflinePagesCache } from "@/components/pwa/offline-cache";
import type { AppRole } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/PageHeader";

export function AppShell({
  permissions,
  roles,
  userName,
  userEmail,
  children,
}: {
  permissions: string[];
  roles: AppRole[];
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}) {
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
    <AuthProvider roles={roles} permissions={permissions}>
      <div className="min-h-screen bg-[#F5F6F8] flex">
        <Sidebar
          permissions={permissions}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
          <TopBar userName={userName} userEmail={userEmail} />
          <DesktopTopBar userName={userName} userEmail={userEmail} />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-10">
            {children}
          </main>
          <footer className="hidden lg:block border-t border-gray-200 bg-white">
            <div className="max-w-6xl mx-auto px-6 py-4">
              <p className="text-xs text-gray-400 text-center">
                © 2026 DHZ Digital OS · Digitálny organizačný systém dobrovoľného hasičského zboru
              </p>
            </div>
          </footer>
        </div>
        <MobileBottomNav />
        <MobileFullMenuDrawer
          isOpen={false}
          onClose={() => {}}
          permissions={permissions}
        />
      </div>
    </AuthProvider>
  );
}
