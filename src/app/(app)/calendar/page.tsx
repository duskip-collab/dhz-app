import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getUnifiedCalendarEvents } from "@/lib/calendar/calendar.service";
import CalendarClient from "./CalendarClient";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.CALENDAR_VIEW);
  const canManage = hasPermission(ctx.permissions, PERMISSIONS.CALENDAR_MANAGE);
  const params = (await searchParams) ?? {};
  const events = await getUnifiedCalendarEvents();
  const rawTypes =
    typeof params.types === "string"
      ? [params.types]
      : Array.isArray(params.types)
        ? params.types
        : null;
  const selectedTypes = rawTypes?.flatMap((value) => value.split(",").filter(Boolean)) ?? null;
  const error = typeof params.error === "string" ? params.error : undefined;
  const success = typeof params.success === "string" ? params.success : undefined;
  const initialSearchQuery = typeof params.q === "string" ? params.q : "";

  return (
    <CalendarClient
      events={events}
      canManage={canManage}
      selectedTypes={selectedTypes}
      initialSearchQuery={initialSearchQuery}
      error={error}
      success={success}
    />
  );
}
