import { User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-[#C62828]" />
        <h1 className="text-2xl font-bold text-gray-900">Môj profil</h1>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900">Osobné informácie</h2>
        <p className="mt-1 text-sm text-gray-500">
          Tvoje členské detaily sú dostupné v prehľade členov.
        </p>
        <div className="mt-4">
          <a href="/members">
            <Button variant="primary" size="sm">Prejsť na členov</Button>
          </a>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900">Kontakt a nastavenia</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pre správu kontaktných informácií a nastavení prejdi na
          <a href="/settings" className="text-[#C62828] hover:underline">nastavenia</a>.
        </p>
      </Card>
    </div>
  );
}
