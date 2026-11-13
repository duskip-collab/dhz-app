import { Siren, Users, Clock, CreditCard, AlertTriangle, Bell, CalendarDays } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getIncidents } from "@/lib/incidents/incidents.service";
import { listMembers } from "@/lib/members/members.service";
import { getExpiringCourses } from "@/lib/members/member-courses.service";
import { getFaults } from "@/lib/equipment/faults.service";
import { getUpcomingInspections } from "@/lib/equipment/inspections.service";
import { getVehicles } from "@/lib/equipment/vehicles.service";
import { getUnifiedCalendarEvents } from "@/lib/calendar/calendar.service";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { QuickActions } from "@/features/dashboard/QuickActions";

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "warn" | "error";
  href?: string;
}

function KpiCard({ icon, label, value, sub, tone = "default", href }: KpiCardProps) {
  const toneClass =
    tone === "warn"
      ? "text-orange-700 border-orange-100"
      : tone === "error"
        ? "text-[#C62828] border-red-100"
        : "text-gray-900 border-gray-200";

  const className = `rounded-xl border p-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all cursor-pointer`;

  const content = (
    <>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {icon}
        {label}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-gray-500">{sub}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

interface AlertItem {
  title: string;
  description: string;
  type: "fault" | "expiry" | "info";
  count: number;
  href: string;
}

function AlertCard({ item }: { item: AlertItem }) {
  const typeConfig = {
    fault: { label: "Porucha", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    expiry: { label: "Expirácia", icon: <Clock className="h-3.5 w-3.5" /> },
    info: { label: "Upozornenie", icon: <Bell className="h-3.5 w-3.5" /> },
  }[item.type];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">
            {typeConfig.icon}
            {typeConfig.label}
          </div>
          <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
          <p className="text-xs text-gray-600">{item.description}</p>
          <p className="mt-1 text-xs font-semibold text-gray-800">{item.count} položiek</p>
        </div>
        <a href={item.href} className="text-xs text-[#C62828] hover:underline">
          Zobraziť všetko →
        </a>
      </div>
    </Card>
  );
}

interface EventItem {
  id: string;
  source: string;
  title: string;
  type: string;
  date: string;
  href: string;
}

function getEventDetailHref(source: string, id: string): string {
  const rawId = id.split(":")[1] ?? id;
  switch (source) {
    case "competition":
      return `/competitions/${rawId}`;
    case "training":
      return `/training/${rawId}`;
    case "calendar":
    case "work_party":
    case "inspection":
    case "fault":
    case "course":
    default:
      return "/calendar";
  }
}

function UpcomingEvent({ event }: { event: EventItem }) {
  const canViewDetail =
    event.source === "competition" ||
    event.source === "training" ||
    event.source === "calendar";

  return (
    <div
      className={`flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:shadow-md hover:border-gray-300 transition ${
        canViewDetail ? "cursor-pointer" : ""
      }`}
      onClick={canViewDetail ? () => (window.location.href = event.href) : undefined}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{event.title}</p>
        <p className="text-xs text-gray-600 truncate">{event.type}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-900">{new Date(event.date).toLocaleDateString("sk-SK")}</p>
        {canViewDetail ? (
          <a href={event.href} className="text-xs text-[#C62828] hover:underline ml-2">
            Detail →
          </a>
        ) : null}
      </div>
    </div>
  );
}

function hasAnyPermission(
  userPermissions: readonly string[],
  permissions: readonly string[]
): boolean {
  return permissions.some((p) => userPermissions.includes(p));
}

async function getExpiringVehicleCount(): Promise<number> {
  const vehicles = await getVehicles();
  const cutoff = Date.now() + 30 * 24 * 60 * 60 * 1000;

  return vehicles.filter((vehicle) => {
    const stk = vehicle.vehicle_details?.stk_valid_until;
    const ek = vehicle.vehicle_details?.ek_valid_until;
    const within = (date: string | null) => !!date && new Date(date).getTime() <= cutoff;
    return within(stk ?? null) || within(ek ?? null);
  }).length;
}

export default async function DashboardPage() {
  const ctx = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
  const firstName = (ctx.email ?? "Hasič").split("@")[0];
  const canSeeFinance = ctx.permissions.includes(PERMISSIONS.FINANCE_VIEW);
  const canViewMembers = hasPermission(ctx.permissions, PERMISSIONS.MEMBERS_VIEW);
  const canViewIncidents = hasPermission(ctx.permissions, PERMISSIONS.INCIDENTS_VIEW);
  const canViewFaults = hasAnyPermission(ctx.permissions, [
    PERMISSIONS.FAULT_CREATE,
    PERMISSIONS.FAULT_MANAGE,
  ]);
  const canViewInspections = hasPermission(ctx.permissions, PERMISSIONS.INSPECTION_VIEW);
  const canViewVehicles = hasPermission(ctx.permissions, PERMISSIONS.VEHICLE_VIEW);
  const canViewCalendar = hasPermission(ctx.permissions, PERMISSIONS.CALENDAR_VIEW);

  const withFallback = async <T,>(
    section: string,
    request: Promise<T>,
    fallback: T,
  ): Promise<T> => {
    try {
      return await request;
    } catch (error) {
      console.error(`[DashboardPage] ${section} failed:`, error);
      return fallback;
    }
  };

  const [incidents, members, financeBalance, faults, expiringVehicleCount, inspections, expiringCourses, calendarEvents] =
    await Promise.all([
      canViewIncidents
        ? withFallback("incidents", getIncidents({ limit: 1000 }), [])
        : Promise.resolve([]),
      canViewMembers ? withFallback("members", listMembers({}), []) : Promise.resolve([]),
      canSeeFinance
        ? withFallback(
            "finance balances",
            (async () => {
              const supabase = await createClient();
              const { data, error } = await supabase
                .from("finance_account_balances")
                .select("current_balance_minor");
              if (error) throw error;
              const totalMinor = (data ?? []).reduce(
                (sum, row) =>
                  sum +
                  Number(
                    (row as { current_balance_minor?: number }).current_balance_minor ?? 0,
                  ),
                0,
              );
              return totalMinor / 100;
            })(),
            0,
          )
        : Promise.resolve(0),
      canViewFaults
        ? withFallback("open faults", getFaults({ open_only: true, limit: 50 }), [])
        : Promise.resolve([]),
      canViewVehicles
        ? withFallback("expiring vehicle documents", getExpiringVehicleCount(), 0)
        : Promise.resolve(0),
      canViewInspections
        ? withFallback("upcoming inspections", getUpcomingInspections(30), [])
        : Promise.resolve([]),
      withFallback("expiring courses", getExpiringCourses(30), []),
      canViewCalendar
        ? withFallback("calendar events", getUnifiedCalendarEvents(), [])
        : Promise.resolve([]),
    ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const stats = {
    incidents: incidents.length,
    incidentsYear: incidents.filter(
      (incident) => new Date(incident.reported_at).getFullYear() === now.getFullYear(),
    ).length,
    incidentsMonth: incidents.filter(
      (incident) => new Date(incident.reported_at) >= monthStart,
    ).length,
    membersTotal: members.length,
    membersActive: members.filter((member) => member.status === "active").length,
    financeBalance,
  };

  const alerts: AlertItem[] = [];
  if (faults.length > 0) {
    alerts.push({
      type: "fault",
      title: "Aktívne poruchy techniky",
      description: "Nevyriešené poruchy vyžadujú opravu alebo pozornosť.",
      count: faults.length,
      href: "/faults",
    });
  }
  if (expiringVehicleCount > 0) {
    alerts.push({
      type: "expiry",
      title: "Končiace STK / EK vozidiel",
      description: "Termín platnosti končí do 30 dní.",
      count: expiringVehicleCount,
      href: "/vehicles",
    });
  }
  if (inspections.length > 0) {
    alerts.push({
      type: "expiry",
      title: "Blížiace sa revízie a servisy",
      description: "Plánované kontroly a servisné prehliadky do 30 dní.",
      count: inspections.length,
      href: "/inspections",
    });
  }
  if (expiringCourses.length > 0) {
    alerts.push({
      type: "expiry",
      title: "Končiaca platnosť kurzov členov",
      description: "Kurzy a certifikácie končiace do 30 dní.",
      count: expiringCourses.length,
      href: "/courses",
    });
  }

  // --- Najbližšie nadchádzajúce udalosti z kalendára ---
  const EVENT_TYPE_LABELS: Record<string, string> = {
    COMPETITION: "Súťaž",
    TRAINING: "Školenie / tréning",
    COURSE: "Kurz",
    INSPECTION: "STK / Revízia",
    WORK_PARTY: "Brigáda",
    FAULT: "Porucha / údržba",
    MEETING: "Porada",
    INCIDENT: "Zásah",
    HOLIDAY: "Sviatok",
    OTHER: "Iné",
  };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming: EventItem[] = calendarEvents
    .filter((event) => new Date(event.start_at) >= startOfToday)
    .slice(0, 6)
    .map((event) => {
      const source = event.source ?? "calendar";
      const id = event.id ?? "";
      return {
        id,
        source,
        title: event.title,
        type: EVENT_TYPE_LABELS[event.type] ?? "Iné",
        date: event.start_at,
        href: getEventDetailHref(source, id),
      };
    });

  return (
    <div className="space-y-6">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          <Siren className="h-4 w-4" /> DHZ
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Dobrý deň, {firstName}</h1>
        <p className="mt-1 text-sm text-gray-500">Prehľad aktuálneho diania v DHZ.</p>
      </div>

      {/* KPI karty */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Siren className="h-4 w-4" />}
          label="Výjazdy"
          value={stats.incidents}
          sub={`Za tento rok: ${stats.incidentsYear} · Za mesiac: ${stats.incidentsMonth}`}
          href={canViewIncidents ? "/incidents" : undefined}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Členovia aktívni / celkom"
          value={`${stats.membersActive} / ${stats.membersTotal}`}
          sub={canViewMembers ? "Aktívne členstvo" : "Bez prístupu k členským dátam"}
          href={canViewMembers ? "/members" : undefined}
        />
        <KpiCard
          icon={<CreditCard className="h-4 w-4" />}
          label="Stav pokladne a účtu"
          value={`${stats.financeBalance.toFixed(2)} €`}
          sub={canSeeFinance ? "Finančné účty zboru" : "Požiadajte o finance.view"}
          tone={stats.financeBalance < 0 ? "error" : "default"}
          href={canSeeFinance ? "/finance" : undefined}
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Blížiace sa termíny"
          value={alerts.filter((a) => a.type === "expiry").length > 0 ? "POZOR" : "V poriadku"}
          sub="STK / EK / kurzy do 30 dní"
          tone={alerts.filter((a) => a.type === "expiry").length > 0 ? "warn" : "default"}
          href={canViewInspections || expiringCourses.length > 0 ? "/courses" : undefined}
        />
      </div>

      {/* Upozornenia a poruchy */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {alerts.length > 0 ? (
          alerts.map((a) => <AlertCard key={a.href} item={a} />)
        ) : (
          <Card title="Žiadne upozornenia" subtitle="Všetko je v poriadku.">
            <p className="text-sm text-gray-500">Žiadne aktívne poruchy ani blížiace sa expiracie.</p>
          </Card>
        )}
      </div>

      {/* Najbližšie akcie z kalendára */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400">
            <CalendarDays className="h-4 w-4 mr-1" /> Najbližšie akcie
          </h2>
          {upcoming.length > 0 && (
            <a href="/calendar" className="text-xs text-[#C62828] hover:underline">
              Všetky akcie →
            </a>
          )}
        </div>
        {upcoming.length > 0 ? (
          <div className="space-y-2">
            {upcoming.map((e) => (
              <UpcomingEvent key={e.href} event={e} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Žiadne nadchádzajúce akcie.</p>
        )}
      </div>

      <QuickActions permissions={ctx.permissions} />
    </div>
  );
}
