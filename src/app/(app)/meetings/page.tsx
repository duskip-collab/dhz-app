import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getMeetings } from "@/lib/meetings/meetings.service";

export default async function Page() {
  await requirePermission(PERMISSIONS.MEETINGS_VIEW);
  const meetings = await getMeetings();
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Porady</h1>
        <Link href="/meetings/new" className="bg-red-700 text-white px-4 py-2 rounded">+ Nová porada</Link>
      </div>
      <div className="space-y-4">
        {meetings.map((m) => (
          <div key={m.id} className="border rounded-lg p-4 bg-white">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{m.title}</h2>
                <p className="text-sm text-gray-600 mt-1">{m.description ?? "Bez popisu"}</p>
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded bg-gray-100 text-gray-700">
                {m.meeting_type}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              <span>
                {new Date(m.scheduled_at).toLocaleDateString("sk-SK", {
                  weekday: "long",
                  year: "numeric",
                  month: "numeric",
                  day: "numeric",
                })}
              </span>
              <span>{m.duration_minutes} min</span>
              {m.location && <span>{m.location}</span>}
              {m.is_remote && m.remote_link && <span>🔗 Vzdialene</span>}
            </div>
            {m.agenda && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-700">Poradie:</p>
                <p className="text-sm text-gray-600">{m.agenda}</p>
              </div>
            )}
          </div>
        ))}
        {meetings.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            Žiadne nadchádzajúce porady.
          </div>
        )}
      </div>
    </div>
  );
}
