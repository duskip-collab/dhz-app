import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getAnnouncements } from "@/lib/announcements/announcements.service";

export default async function Page() {
  await requirePermission(PERMISSIONS.ANNOUNCEMENTS_VIEW);
  const announcements = await getAnnouncements();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Oznamy</h1>
      <div className="space-y-4">
        {announcements.map((a) => (
          <div key={a.id} className="border rounded-lg p-4 bg-white">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{a.title}</h2>
                <p className="text-sm text-gray-600 mt-1">{a.content}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${a.priority === "URGENT" ? "bg-red-100 text-red-700" : a.priority === "HIGH" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                {a.priority}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              <span>Zverejnené: {new Date(a.published_at).toLocaleDateString("sk-SK")}</span>
              {a.is_pinned && <span className="text-yellow-600">📌 Prilepené</span>}
              {a.expires_at && <span>Platí do: {new Date(a.expires_at).toLocaleDateString("sk-SK")}</span>}
            </div>
          </div>
        ))}
        {announcements.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            Žiadne aktívne oznámenia.
          </div>
        )}
      </div>
    </div>
  );
}
