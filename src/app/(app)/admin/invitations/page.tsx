import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listInvitations } from "@/lib/auth/invitations.service";
import { getServerRegistrationUrl } from "@/lib/auth/invitations.share";
import { InvitationManager } from "@/features/admin/components/InvitationManager";

export default async function InvitationsPage() {
  await requirePermission(PERMISSIONS.ADMIN_USERS);

  const invitations = await listInvitations();

  // Absolútna URL aplikácie (Vercel: NEXT_PUBLIC_APP_URL / VERCEL_*).
  // Vypočítané na serveri, aby zdieľací text obsahoval vždy platný odkaz.
  const registrationUrl = getServerRegistrationUrl();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
      >
        <ArrowLeft className="h-4 w-4" /> Späť na administráciu
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <KeyRound className="h-6 w-6 text-[#C62828]" />
          Pozývacie kódy
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Vytvárajte jednorazové pozývacie kódy s rolou a obmedzenou platnosťou. Kód sa zobrazí
          iba raz – v databáze je uložený len jeho hash.
        </p>
      </div>

      <InvitationManager invitations={invitations} registrationUrl={registrationUrl} />
    </div>
  );
}
