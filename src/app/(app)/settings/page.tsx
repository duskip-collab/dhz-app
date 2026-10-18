import { Settings } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-[#C62828]" />
        <h1 className="text-2xl font-bold text-gray-900">Nastavenia</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-base font-semibold">Profil</h2>
          <p className="text-sm text-gray-500 mt-1">Tvoje osobné informácie a kontakt.</p>
          <div className="mt-4"><a href="/profile"><Button variant="secondary" size="sm">Profil</Button></a></div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold">Administrácia</h2>
          <p className="text-sm text-gray-500 mt-1">Správa používateľov a oprávnení.</p>
          <div className="mt-4"><a href="/admin"><Button variant="secondary" size="sm">Admin</Button></a></div>
        </Card>
      </div>
    </div>
  );
}
