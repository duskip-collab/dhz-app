"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar, DesktopTopBar } from "./TopBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { AuthProvider } from "@/lib/auth/client";
import { createClient } from "@/lib/supabase/client";
import { clearOfflinePagesCache } from "@/components/pwa/offline-cache";
import type { AppRole } from "@/lib/auth/roles";

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
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check if onboarding is needed - member has onboarding_completed = false
  useEffect(() => {
    async function checkOnboarding() {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error("Error getting auth user:", authError);
        return;
      }
      const { data, error: dbError } = (await supabase
        .from("members")
        .select("onboarding_completed")
        .eq("auth_user_id", authData.user?.id)
        .single()) as { data: { onboarding_completed: boolean } | null; error: any };

      if (authError) {
        console.error("Error getting auth user:", authError);
        return;
      }

      if (dbError && dbError.code !== "PGRST116") {
        console.error("Error checking onboarding status:", dbError);
        return;
      }

      // If member exists and onboarding is not completed, show the modal
      if (data && data.onboarding_completed === false) {
        setShowOnboarding(true);
      }
    }

    checkOnboarding();
  }, [permissions, roles, userEmail]);

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
          <TopBar userName={userName} userEmail={userEmail} permissions={permissions} />
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
      </div>
    </AuthProvider>
  );
}
