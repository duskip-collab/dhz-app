"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createWorkParty } from "@/lib/work-parties/work-parties.service";
import type { WorkPartyInput } from "@/lib/work-parties/work-parties.validation";

export type WorkPartyActionState = { message: string } | null;

export async function createWorkPartyAction(
  _prev: WorkPartyActionState,
  formData: FormData,
): Promise<WorkPartyActionState> {
  const input: WorkPartyInput = {
    title: String(formData.get("title") ?? "").trim(),
    description: (formData.get("description") as string) || null,
    work_date: String(formData.get("work_date") ?? "").trim(),
    duration_hours: formData.get("duration_hours") ? Number(formData.get("duration_hours")) : undefined,
    location: (formData.get("location") as string) || null,
    status: (formData.get("status") as string) || undefined,
    notes: (formData.get("notes") as string) || null,
  };
  try {
    await createWorkParty(input);
  } catch {
    return { message: "Brigádu sa nepodarilo uložiť. Skontroluj údaje a skús to znova." };
  }
  revalidatePath("/brigades");
  redirect("/brigades");
}