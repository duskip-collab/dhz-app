import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getWorkParties } from "@/lib/work-parties/work-parties.service";

export default async function Page() {
  await requirePermission(PERMISSIONS.WORK_PARTIES_VIEW);
  const workParties = await getWorkParties();
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Brigády</h1>
        <Link href="/brigades/new" className="bg-red-700 text-white px-4 py-2 rounded">+ Nová brigáda</Link>
      </div>
      <div className="space-y-4">
        {workParties.map((wp) => (
          <div key={wp.id} className="border rounded-lg p-4 bg-white">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{wp.title}</h2>
                <p className="text-sm text-gray-600 mt-1">{wp.description ?? "Bez popisu"}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${wp.status === "COMPLETED" ? "bg-green-100 text-green-700" : wp.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-700" : wp.status === "CANCELLED" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                {wp.status}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              <span>Dátum: {new Date(wp.work_date).toLocaleDateString("sk-SK")}</span>
              <span>{wp.duration_hours} hodín</span>
              {wp.location && <span>{wp.location}</span>}
              {wp.max_volunteers && <span>Max. volontaires: {wp.max_volunteers}</span>}
            </div>
            {wp.notes && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-700">Poznámky:</p>
                <p className="text-sm text-gray-600">{wp.notes}</p>
              </div>
            )}
          </div>
        ))}
        {workParties.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            Žiadne geplánované brigády.
          </div>
        )}
      </div>
    </div>
  );
}
