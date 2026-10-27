"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createWorkParty } from "@/lib/work-parties/work-parties.service";
import type { WorkPartyInput } from "@/lib/work-parties/work-parties.validation";

export async function createWorkPartyAction(_prev: any, formData: FormData) {
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
    revalidatePath("/brigades");
    redirect("/brigades");
  } catch (e: any) {
    return { message: "Brigádu sa nepodarilo uložiť. Skontroluj údaje a skús to znova." };
  }
}