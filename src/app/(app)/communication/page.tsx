import { MessagesSquare } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getAnnouncements } from "@/lib/announcements/announcements.service";
import { type Announcement } from "@/lib/announcements/announcements.service";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function CommunicationPage() {
  await requirePermission(PERMISSIONS.COMMUNICATION_VIEW);

  let announcements: Announcement[] = [];
  try {
    announcements = await getAnnouncements({ active_only: true } as never) as unknown as Announcement[];
  } catch {
    announcements = [];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessagesSquare className="h-6 w-6 text-[#C62828]" />
        <h1 className="text-2xl font-bold text-gray-900">Výbor — Oznámy</h1>
        <p className="text-sm text-gray-500">Oznámy a komunikácia zboru</p>
      </div>

      {announcements.length === 0 ? (
        <EmptyState title="Žiadne oznámy" description="Zatiaľ neboli publikované žiadne oznámy." />
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{a.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{a.content}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {a.created_at ? new Date(a.created_at).toLocaleDateString("sk-SK") : ""}
                    {a.priority === "HIGH" && <span className="inline-block bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded">Dôležité</span>}
                    {a.is_pinned && <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded ml-1">Pripnuté</span>}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
