import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCalendarEvents } from "@/lib/calendar/calendar.service";

export default async function Page() {
  await requirePermission(PERMISSIONS.CALENDAR_VIEW);
  const events = await getCalendarEvents();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Kalendár</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {events.map((event) => (
          <div key={event.id} className="border rounded-lg p-4 bg-white">
            <h2 className="text-lg font-semibold text-gray-900">{event.title}</h2>
            <p className="text-sm text-gray-600">{event.description ?? "Bez popisu"}</p>
            <p className="text-xs text-gray-500 mt-2">
              {new Date(event.start_at).toLocaleDateString("sk-SK")} –
              {new Date(event.end_at).toLocaleDateString("sk-SK")}
            </p>
            <span className="inline-block mt-2 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded">
              {event.event_type}
            </span>
          </div>
        ))}
        {events.length === 0 && (
          <div className="col-span-3 text-center text-gray-500 py-8">
            Žiadne udalosti v kalendári.
          </div>
        )}
      </div>
    </div>
  );
}
