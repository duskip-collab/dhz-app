"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteCalendarEvent } from "@/lib/calendar/calendar.service";

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
