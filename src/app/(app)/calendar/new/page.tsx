import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import CalendarEventForm from "./CalendarEventForm";

// replace form block
export default async function NewCalendarEventPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.CALENDAR_MANAGE);
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/calendar" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]">
        <ArrowLeft className="h-4 w-4" /> Späť na kalendár
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Nová udalosť</h1>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      <CalendarEventForm />
    </div>
  );
}