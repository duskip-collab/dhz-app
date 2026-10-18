import { FileText } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function DocumentsPage() {
  await requirePermission(PERMISSIONS.DOCUMENTS_VIEW);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-[#C62828]" />
        <h1 className="text-2xl font-bold text-gray-900">Dokumenty</h1>
        <p className="text-sm text-gray-500">Prehľad a správa dokumentácie</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-base font-semibold">Financia dokumenty</h2>
          <p className="text-sm text-gray-500 mt-1">Prílohy k finančným transakciám (faktúry, doklady).</p>
          <div className="mt-4">
            <Link href="/dashboard/finance">
              <Button variant="secondary" size="sm">Financie →</Button>
            </Link>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold">Reporty a exporty</h2>
          <p className="text-sm text-gray-500 mt-1">Generované reporty a prehlady.</p>
          <div className="mt-4">
            <Link href="/reports">
              <Button variant="secondary" size="sm">Reporty →</Button>
            </Link>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold">Dokumenty zboru</h2>
        <p className="text-sm text-gray-500 mt-1">
          Tu budú dostupné dokumenty a protokoly zboru (štatút, protokoly škod, plány).
        </p>
      </Card>
    </div>
  );
}
