import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function ModulePlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {description ?? "Modul bude implementovaný v ďalšej vývojovej fáze."}
        </p>
      </div>
      <Card>
        <p className="text-sm text-gray-600">
          Toto je placeholder obrazovka. Business logika (databázové CRUD, RLS, formuláre)
          sa doplní v nasledujúcom kroku.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-[#C62828] hover:text-[#8E0000]"
        >
          <ArrowLeft className="w-4 h-4" /> Späť na Domov
        </Link>
      </Card>
    </div>
  );
}
