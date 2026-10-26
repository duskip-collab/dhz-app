"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteCalendarEvent, createCalendarEvent } from "@/lib/calendar/calendar.service";

export async function createCalendarEventAction(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const event_type = String(formData.get("event_type") ?? "OTHER");
  const start_at = String(formData.get("start_at") ?? "");
  const end_at = String(formData.get("end_at") ?? "");
  const location = String(formData.get("location") ?? "").trim() || null;
  if (!title || !start_at || !end_at) {
    redirectWith("/calendar/new", "error", "Vyplňte povinné polia.");
  }
  const startIso = new Date(start_at).toISOString();
  const endIso = new Date(end_at).toISOString();
  try {
    await createCalendarEvent({ title, description, event_type, start_at: startIso, end_at: endIso, location, all_day: false, is_recurring: false, recurrence_rule: null });
    revalidatePath("/calendar");
    redirectWith("/calendar", "success", "Udalosť bola vytvorená.");
  } catch (e) {
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    if (status === 403) redirectWith("/calendar/new", "error", "Nemáte oprávnenie calendar.manage.");
    redirectWith("/calendar/new", "error", e instanceof Error ? e.message : "Chyba pri vytváraní udalosti.");
  }
}

function redirectWith(path: string, key: string, message: string): never {
  const params = new URLSearchParams({ [key]: message });
  redirect(`${path}?${params.toString()}`);
}

/**
 * Zmaže udalosť kalendára (calendar_events). Vyžaduje calendar.manage
 * (kontrolované v službe). Používa sa vo formulári na /calendar.
 */
export async function deleteCalendarEventAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("event_id") ?? "");
  if (!eventId) {
    redirectWith("/calendar", "error", "Chýba identifikátor udalosti.");
  }
  try {
    await deleteCalendarEvent(eventId);
    revalidatePath("/calendar");
    redirectWith("/calendar", "success", "Udalosť bola odstránená.");
  } catch (e) {
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    if (status === 403) redirectWith("/calendar", "error", "Nemáte oprávnenie calendar.manage.");
    if (status === 404) redirectWith("/calendar", "error", "Udalosť sa nenašla.");
    redirectWith(
      "/calendar",
      "error",
      e instanceof Error ? e.message : "Chyba pri odstraňovaní udalosti.",
    );
  }
}
