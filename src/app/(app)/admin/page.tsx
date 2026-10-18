import { ShieldCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function AdminPage() {
  await requirePermission(PERMISSIONS.ADMIN_USERS);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-[#C62828]" />
        <h1 className="text-2xl font-bold text-gray-900">Administrácia</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <h2 className="text-base font-semibold">Členovia</h2>
          <p className="text-sm text-gray-500 mt-1">Správa a prehľad všetkých členov.</p>
          <div className="mt-4"><a href="/members"><Button variant="secondary" size="sm">Členovia</Button></a></div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold">Vozidlá a technika</h2>
          <p className="text-sm text-gray-500 mt-1">Majetok, výzbroj a inventar.</p>
          <div className="mt-4"><a href="/gear"><Button variant="secondary" size="sm">Technika</Button></a></div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold">Financie</h2>
          <p className="text-sm text-gray-500 mt-1">Transakcií, kontá a reporty.</p>
          <div className="mt-4"><a href="/finance"><Button variant="secondary" size="sm">Financie</Button></a></div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold">Systémové informácie</h2>
        <p className="text-sm text-gray-500 mt-1">Tu budú dostupné systémové logy, audit trail a konfigurácia.</p>
        <div className="flex gap-4 mt-4">
          <a href="/reports"><Button variant="secondary" size="sm">Reporty</Button></a>
          <a href="/settings"><Button variant="secondary" size="sm">Nastavenia</Button></a>
        </div>
      </Card>
    </div>
  );
}
