"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  postCommitteeMessage,
  postCommitteeReply,
  deleteCommitteeMessage,
} from "@/lib/committee/committee.service";

function statusMessage(e: unknown, fallback: string): string {
  const status = (e as { statusCode?: number }).statusCode ?? 500;
  if (status === 403) return "Nemáte oprávnenie.";
  if (status === 404) return "Správa sa nenašla.";
  if (status === 400) return e instanceof Error ? e.message : "Neplatné údaje.";
  return e instanceof Error && e.message ? e.message : fallback;
}


/**
 * postCommitteeMessageAction – nová správa na nástenku.
 * Vyžaduje communication.send.
 */
export async function postCommitteeMessageAction(formData: FormData): Promise<void> {
  const content = String(formData.get("content") ?? "");
  try {
    await postCommitteeMessage(content);
    revalidatePath("/committee");
    const params = new URLSearchParams({ success: "Správa bola pridaná." });
    redirect(`/committee?${params.toString()}`);
  } catch (e) {
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    const params = new URLSearchParams({ error: statusMessage(e, "Chyba pri ukladaní správy.") });
    redirect(`/committee?${params.toString()}`);
  }
}

/**
 * postCommitteeReplyAction – odpoveď / komentár na správu (vlákno).
 * Vyžaduje communication.send.
 */
export async function postCommitteeReplyAction(formData: FormData): Promise<void> {
  const parentId = String(formData.get("message_id") ?? "");
  const content = String(formData.get("content") ?? "");
  try {
    if (!parentId) throw Object.assign(new Error("Chýba identifikátor správy."), { statusCode: 400 });
    await postCommitteeReply(parentId, content);
    revalidatePath("/committee");
    const params = new URLSearchParams({ success: "Odpoveď bola pridaná." });
    redirect(`/committee?${params.toString()}`);
  } catch (e) {
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    const params = new URLSearchParams({ error: statusMessage(e, "Chyba pri ukladaní odpovede.") });
    redirect(`/committee?${params.toString()}`);
  }
}

/**
 * deleteCommitteeMessageAction – vymazanie správy alebo odpovede.
 * Vyžaduje communication.send (RLS: autor alebo ADMIN).
 */
export async function deleteCommitteeMessageAction(formData: FormData): Promise<void> {
  const messageId = String(formData.get("message_id") ?? "");
  try {
    if (!messageId) throw Object.assign(new Error("Chýba identifikátor správy."), { statusCode: 400 });
    await deleteCommitteeMessage(messageId);
    revalidatePath("/committee");
    const params = new URLSearchParams({ success: "Správa bola odstránená." });
    redirect(`/committee?${params.toString()}`);
  } catch (e) {
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    const params = new URLSearchParams({ error: statusMessage(e, "Chyba pri mazaní správy.") });
    redirect(`/committee?${params.toString()}`);
  }
}
