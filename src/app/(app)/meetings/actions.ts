"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createMeeting } from "@/lib/meetings/meetings.service";
import type { MeetingInput } from "@/lib/meetings/meetings.validation";

export async function createMeetingAction(_prev: any, formData: FormData) {
  const input: MeetingInput = {
    title: String(formData.get("title") ?? "").trim(),
    description: (formData.get("description") as string) || null,
    meeting_type: (formData.get("meeting_type") as string) || undefined,
    scheduled_at: String(formData.get("scheduled_at") ?? "").trim(),
    duration_minutes: formData.get("duration_minutes") ? Number(formData.get("duration_minutes")) : undefined,
    location: (formData.get("location") as string) || null,
    agenda: (formData.get("agenda") as string) || null,
    is_remote: formData.get("is_remote") === "on",
    remote_link: (formData.get("remote_link") as string) || null,
  };
  try {
    await createMeeting(input);
    revalidatePath("/meetings");
    redirect("/meetings");
  } catch (e: any) {
    return { message: "Poradu sa nepodarilo uložiť. Skontroluj údaje a skús to znova." };
  }
}