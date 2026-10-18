import Link from "next/link";
import { AlertTriangle, User } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function AccessDeniedPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-500">
          <AlertTriangle className="h-4 w-4" /> Prístup odmietnutý
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Na túto stránku nemáte oprávnenie</h1>
        <p className="mt-1 text-sm text-gray-500">
          Ste prihlásený, ale váš účet nemá potrebnú rolu alebo permisiu pre požadovaný modul.
        </p>
      </div>

      <Card title="Čo ďalej?" subtitle="Požiadajte administrátora o priradenie správnej roly alebo oprávnenia.">
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            Ak ste sa práve prihlásili a očakávate prístup, skontrolujte, či váš účet má
            v databáze priradenú aspoň jednu aplikačnú rolu.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              <User className="h-4 w-4" /> Môj profil
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
