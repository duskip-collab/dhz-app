// =============================================================================
// Detail oznámenia – stránka na zobrazenie jedného oznámenia
// =============================================================================
// K29.0: Detail oznamu pre všetkých prihlásených užívateľov (prečítané)
// =============================================================================

import Link from "next/link";
import { getAnnouncementById } from "@/lib/announcements/announcements.service";

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const announcement = await getAnnouncementById(id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/announcements"
        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        ↩ Späť na oznámenia
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{announcement.title}</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            Priorita: {announcement.priority}
          </span>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
            Zverejnené: {new Date(announcement.published_at).toLocaleDateString("sk-SK")}
          </span>
        </div>
      </div>

      <div className="prose prose-sm max-w-none border border-gray-200 rounded-lg p-4 bg-gray-50">
        <h2 className="text-lg font-semibold">Obsah</h2>
        <p className="text-gray-700">{announcement.content}</p>
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        <p>Vytvorené: {new Date(announcement.created_at).toLocaleString("sk-SK")}</p>
        <p>Aktualizávané: {new Date(announcement.updated_at).toLocaleString("sk-SK")}</p>
      </div>
    </div>
  );
}
