// =============================================================================
// Oznamy Server Action - publikovanie a správa oznamov
// =============================================================================
// K29.0: Server Action pre zverejšenie oznamu
// Využíva requireCommitteeMember() na overenie oprávnení
// =============================================================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCommitteeMember } from "@/lib/auth/committee";
import { createAuthError } from "@/lib/members/members.errors";
import { isAnnouncementPriority } from "@/lib/announcements/announcements.validation";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function publishAnnouncementAction(formData: FormData): Promise<void> {
  const ctx = await requireCommitteeMember();
  const requestId = formText(formData, "request_id");
  const title = formText(formData, "title");
  const content = formText(formData, "content");
  const priority = formText(formData, "priority") || "NORMAL";
  const shouldPublish = formText(formData, "publish") === "true";

  if (!UUID_PATTERN.test(requestId)) {
    throw createAuthError(400, "Neplatný identifikátor odoslania.");
  }
  if (!title || title.length > 200 || !content) {
    throw createAuthError(400, "Názov (max. 200 znakov) a obsah sú povinné.");
  }
  if (!isAnnouncementPriority(priority)) {
    throw createAuthError(400, "Neplatná priorita oznámenia.");
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from("announcements")
    .insert({
      id: requestId,
      title,
      content,
      priority,
      published_at: new Date().toISOString(),
      is_active: shouldPublish,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing, error: lookupError } = await supabase
        .from("announcements")
        .select("id, title, content, priority, is_active")
        .eq("id", requestId)
        .eq("created_by", ctx.userId)
        .maybeSingle();

      if (lookupError) {
        console.error("[publishAnnouncementAction] Idempotency lookup failed:", lookupError);
        throw createAuthError(500, "Nepodarilo sa overiť opakované odoslanie.");
      }

      if (
        existing &&
        existing.title === title &&
        existing.content === content &&
        existing.priority === priority &&
        existing.is_active === shouldPublish
      ) {
        revalidatePath("/announcements");
        redirect(shouldPublish ? "/announcements" : "/announcements/new");
      }

      throw createAuthError(409, "Toto odoslanie už bolo spracované.");
    }

    console.error("[publishAnnouncement] Supabase insert error:", insertError);
    throw createAuthError(500, "Chyba pri ukladaní oznamu.");
  }

  revalidatePath("/announcements");
  revalidatePath("/announcements/new");
  redirect(shouldPublish ? "/announcements" : "/announcements/new");
}

