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
import { Card } from "@/components/ui/Card";
import { QuickActions } from "@/features/dashboard/QuickActions";

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "warn" | "error";
}

function KpiCard({ icon, label, value, sub, tone = "default" }: KpiCardProps) {
  const toneClass =
    tone === "warn"
      ? "text-orange-700 border-orange-100"
      : tone === "error"
        ? "text-[#C62828] border-red-100"
        : "text-gray-900 border-gray-200";

  return (
    <div className="rounded-xl border p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {icon}
        {label}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
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
  title: string;
  type: string;
  date: string;
  href: string;
}

function UpcomingEvent({ event }: { event: EventItem }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-white">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{event.title}</p>
        <p className="text-xs text-gray-600 truncate">{event.type}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-gray-900">{new Date(event.date).toLocaleDateString("sk-SK")}</p>
        <a href={event.href} className="text-xs text-[#C62828] hover:underline">
          Detail →
        </a>
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

  // --- KPI: Výjazdy (celkom / za tento rok / za mesiac) ---
  const stats = {
    incidents: 0,
    incidentsYear: 0,
    incidentsMonth: 0,
    membersTotal: 0,
    membersActive: 0,
    financeBalance: 0,
  };
  if (canViewIncidents) {
    try {
      const list = await getIncidents({ limit: 1000 });
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      stats.incidents = list.length;
      stats.incidentsYear = list.filter(
        (i) => new Date(i.reported_at).getFullYear() === now.getFullYear(),
      ).length;
      stats.incidentsMonth = list.filter((i) => new Date(i.reported_at) >= monthStart).length;
    } catch {
      // nekritické – KPI ostane na 0
    }
  }

  // --- KPI: Členovia (aktívni / celkom) ---
  if (canViewMembers) {
    try {
      const all = await listMembers({});
      stats.membersTotal = all.length;
      stats.membersActive = all.filter((m) => m.status === "active").length;
    } catch {
      // nekritické
    }
  }

  // --- KPI: Stav pokladne a účtu ---
  if (canSeeFinance) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("finance_account_balances")
        .select("current_balance_minor");
      const totalMinor = (data ?? []).reduce(
        (sum, r) => sum + Number((r as { current_balance_minor?: number }).current_balance_minor ?? 0),
        0,
      );
      stats.financeBalance = totalMinor / 100;
    } catch {
      // nekritické
    }
  }

  // --- Upozornenia: aktívne poruchy ---
  const alerts: AlertItem[] = [];
  if (canViewFaults) {
    try {
      const faults = await getFaults({ open_only: true, limit: 50 });
      if (faults.length > 0) {
        alerts.push({
          type: "fault",
          title: "Aktívne poruchy techniky",
          description: "Nevyriešené poruchy vyžadujú opravu alebo pozornosť.",
          count: faults.length,
          href: "/faults",
        });
      }
    } catch {
      // nekritické
    }
  }

  // --- Upozornenia: expirácie STK / EK vozidiel (do 30 dní) ---
  if (canViewVehicles) {
    try {
      const expiringCount = await getExpiringVehicleCount();
      if (expiringCount > 0) {
        alerts.push({
          type: "expiry",
          title: "Končiace STK / EK vozidiel",
          description: "Termín platnosti končí do 30 dní.",
          count: expiringCount,
          href: "/vehicles",
        });
      }
    } catch {
      // nekritické
    }
  }

  // --- Upozornenia: blížiace sa revízie a servisy (do 30 dní) ---
  if (canViewInspections) {
    try {
      const inspections = await getUpcomingInspections(30);
      if (inspections.length > 0) {
        alerts.push({
          type: "expiry",
          title: "Blížiace sa revízie a servisy",
          description: "Plánované kontroly a servisné prehliadky do 30 dní.",
          count: inspections.length,
          href: "/inspections",
        });
      }
    } catch {
      // nekritické
    }
  }

  // --- Upozornenia: končiaca platnosť kurzov členov (do 30 dní) ---
  try {
    const expiringCourses = await getExpiringCourses(30);
    if (expiringCourses.length > 0) {
      alerts.push({
        type: "expiry",
        title: "Končiaca platnosť kurzov členov",
        description: "Kurzy a certifikácie končiace do 30 dní.",
        count: expiringCourses.length,
        href: "/courses",
      });
    }
  } catch {
    // nekritické
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
  let upcoming: EventItem[] = [];
  if (canViewCalendar) {
    try {
      const events = await getUnifiedCalendarEvents();
      upcoming = events
        .filter((e) => new Date(e.start_at) >= startOfToday)
        .slice(0, 6)
        .map((e) => ({
          title: e.title,
          type: EVENT_TYPE_LABELS[e.type] ?? "Iné",
          date: e.start_at,
          href: "/calendar",
        }));
    } catch {
      // nekritické
    }
  }

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
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Členovia aktívni / celkom"
          value={`${stats.membersActive} / ${stats.membersTotal}`}
          sub={canViewMembers ? "Aktívne členstvo" : "Bez prístupu k členským dátam"}
        />
        <KpiCard
          icon={<CreditCard className="h-4 w-4" />}
          label="Stav pokladne a účtu"
          value={`${stats.financeBalance.toFixed(2)} €`}
          sub={canSeeFinance ? "Finančné účty zboru" : "Požiadajte o finance.view"}
          tone={stats.financeBalance < 0 ? "error" : "default"}
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Blížiace sa termíny"
          value={alerts.filter((a) => a.type === "expiry").length > 0 ? "POZOR" : "V poriadku"}
          sub="STK / EK / kurzy do 30 dní"
          tone={alerts.filter((a) => a.type === "expiry").length > 0 ? "warn" : "default"}
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
