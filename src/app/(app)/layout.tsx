import { AppShell } from "@/components/layout/AppShell";
import { getAuthContext } from "@/lib/auth/server";

// Všetky (app) stránky sú dynamické – čítajú session z cookies.
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  const email = ctx.email ?? "pouzivatel@dhz.sk";
  const userName = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

  return (
    <AppShell permissions={ctx.permissions} roles={ctx.roles} userName={userName} userEmail={email}>
      {children}
    </AppShell>
  );
}
