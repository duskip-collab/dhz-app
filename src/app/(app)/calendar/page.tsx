import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getUnifiedCalendarEvents, type UnifiedCalendarEvent } from "@/lib/calendar/calendar.service";
import { deleteCalendarEventAction } from "./actions";

// Farebné odlíšenie podľa typu udalosti.
const TYPE_STYLE: Record<string, { label: string; badge: string; border: string }> = {
  COMPETITION: { label: "Súťaž", badge: "bg-red-100 text-red-800", border: "border-l-red-500" },
  TRAINING: { label: "Školenie", badge: "bg-blue-100 text-blue-800", border: "border-l-blue-500" },
  COURSE: { label: "Kurz", badge: "bg-blue-100 text-blue-800", border: "border-l-blue-500" },
  INSPECTION: { label: "STK / Revízia", badge: "bg-orange-100 text-orange-800", border: "border-l-orange-500" },
  WORK_PARTY: { label: "Brigáda", badge: "bg-green-100 text-green-800", border: "border-l-green-500" },
  FAULT: { label: "Porucha / údržba", badge: "bg-purple-100 text-purple-800", border: "border-l-purple-500" },
  MEETING: { label: "Porada", badge: "bg-gray-200 text-gray-800", border: "border-l-gray-500" },
  INCIDENT: { label: "Zásah", badge: "bg-red-100 text-red-800", border: "border-l-red-500" },
  HOLIDAY: { label: "Sviatok", badge: "bg-yellow-100 text-yellow-800", border: "border-l-yellow-500" },
  OTHER: { label: "Iné", badge: "bg-gray-100 text-gray-700", border: "border-l-gray-400" },
};

function typeStyle(type: string) {
  return TYPE_STYLE[type] ?? { label: type, badge: "bg-gray-100 text-gray-700", border: "border-l-gray-400" };
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.CALENDAR_VIEW);
  const canManage = hasPermission(ctx.permissions, PERMISSIONS.CALENDAR_MANAGE);
  const sp = (await searchParams) ?? {};
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;
  const events = await getUnifiedCalendarEvents();

  const selectedTypesParam = typeof sp.types === "string" ? sp.types : undefined;
  const selectedTypes = selectedTypesParam
    ? new Set(selectedTypesParam.split(",").filter(Boolean))
    : null;
  const filteredEvents = selectedTypes
    ? events.filter((e) => selectedTypes.has(e.type))
    : events;

  // Zoskupenie podľa dňa.
  const byDay = new Map<string, UnifiedCalendarEvent[]>();
  for (const ev of filteredEvents) {
    const day = ev.start_at.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(ev);
    byDay.set(day, list);
  }

  const legend = [
    { key: "COMPETITION", label: "Súťaž" },
    { key: "TRAINING", label: "Školenie / Tréning" },
    { key: "COURSE", label: "Kurz (platnosť)" },
    { key: "INSPECTION", label: "STK / Revízia / Servis" },
    { key: "WORK_PARTY", label: "Brigáda" },
    { key: "FAULT", label: "Porucha / údržba" },
    { key: "MEETING", label: "Porada" },
    { key: "OTHER", label: "Iné" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kalendár</h1>
        <p className="mt-1 text-sm text-gray-500">
          Centrálny prehľad akcií, brigád, súťaží, školení, revízií a porúch z celého systému.
        </p>
      </div>

      {canManage && (
        <div className="mb-2">
          <a href="/calendar/new" className="inline-flex items-center rounded-lg bg-[#C62828] px-4 py-2 text-sm font-semibold text-white">
            + Pridať akciu
          </a>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-[#C62828]">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Filter typov udalostí */}
      <details className="rounded-lg border border-gray-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">Filter</summary>
        <form method="get" className="mt-3 grid grid-cols-2 gap-2">
          {legend.map((l) => (
            <label key={l.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="types"
                value={l.key}
                defaultChecked={!selectedTypes || selectedTypes.has(l.key)}
              />
              {l.label}
            </label>
          ))}
          <button type="submit" className="col-span-2 mt-2 rounded-lg bg-[#C62828] px-3 py-2 text-sm font-medium text-white">
            Použiť filter
          </button>
        </form>
      </details>

      {filteredEvents.length === 0 && (
        <div className="text-center text-gray-500 py-12">
          Žiadne plánované udalosti v kalendári.
        </div>
      )}

      <div className="space-y-6">
        {[...byDay.entries()].map(([day, dayEvents]) => (
          <section key={day}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
              {formatDay(day)}
            </h2>
            <div className="space-y-2">
              {dayEvents.map((event) => {
                const style = typeStyle(event.type);
                return (
                  <div
                    key={event.id}
                    className={`rounded-r-lg border border-l-4 border-gray-200 bg-white p-4 ${style.border}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{event.title}</h3>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                        {style.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {formatTime(event.start_at)}
                      {event.end_at && event.end_at.slice(0, 10) !== event.start_at.slice(0, 10)
                        ? ` – ${formatDay(event.end_at)}`
                        : event.end_at
                          ? ` – ${formatTime(event.end_at)}`
                          : ""}
                      {event.location ? ` · ${event.location}` : ""}
                      {event.status ? ` · ${event.status}` : ""}
                    </p>
                    {event.description && (
                      <p className="mt-1 text-sm text-gray-700">{event.description}</p>
                    )}
                    {canManage && event.source === "calendar" ? (
                      <form action={deleteCalendarEventAction} className="mt-2">
                        <input
                          type="hidden"
                          name="event_id"
                          value={event.id.replace(/^calendar:/, "")}
                        />
                        <button
                          type="submit"
                          className="min-h-[36px] rounded-lg border border-red-200 px-3 text-xs font-semibold text-[#C62828] transition hover:bg-red-50 focus:ring-2 focus:ring-[#C62828] focus:ring-offset-2"
                        >
                          Odstrániť udalosť
                        </button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
