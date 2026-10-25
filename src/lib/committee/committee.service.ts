import { createClient } from "@/lib/supabase/server";
import { createAuthError } from "@/lib/members/members.errors";
import { requireAuthenticated } from "../documents/org-documents.auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";

// =============================================================================
// ČLENOVIA VÝBORU
// =============================================================================

export interface CommitteeMember {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  rank: string | null;
  position: string | null;
  photo_path: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * getCommitteeMembers – zoznam členov výboru s funkcionárskym zaradením.
 * Vyžaduje `communication.view`.
 */
export async function getCommitteeMembers(): Promise<CommitteeMember[]> {
  const ctx = await requireAuthenticated();
  const allowed =
    ctx.permissions.includes(PERMISSIONS.COMMUNICATION_VIEW) ||
    (await hasPermissionServer(ctx.userId, PERMISSIONS.COMMUNICATION_VIEW));
  if (!allowed) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie výboru.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, title, rank, position, photo_path, email, phone")
    .eq("is_committee_member", true)
    .eq("status", "active")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    console.error("[getCommitteeMembers] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní členov výboru.");
  }
  return (data ?? []) as CommitteeMember[];
}

// =============================================================================
// CHAT / SPRÁVY VÝBORU (správy + vláknové odpovede)
// =============================================================================

export interface CommitteeMessageAuthor {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
}

export interface CommitteeMessage {
  id: string;
  parent_id: string | null;
  author_member_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  author: CommitteeMessageAuthor | null;
  replies: CommitteeMessage[];
}

const MESSAGE_SELECT =
  "*, author:members!committee_messages_author_member_id_fkey(id, first_name, last_name, position)";

function mapMessage(row: Record<string, unknown>): CommitteeMessage {
  return {
    id: String(row.id),
    parent_id: (row.parent_id as string | null) ?? null,
    author_member_id: (row.author_member_id as string | null) ?? null,
    content: String(row.content ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    author: (row.author as CommitteeMessageAuthor | null) ?? null,
    replies: [],
  };
}

async function assertView(ctx: { userId: string; permissions: readonly string[] }): Promise<void> {
  const allowed =
    ctx.permissions.includes(PERMISSIONS.COMMUNICATION_VIEW) ||
    (await hasPermissionServer(ctx.userId, PERMISSIONS.COMMUNICATION_VIEW));
  if (!allowed) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie výboru.");
  }
}

async function assertSend(ctx: { userId: string; permissions: readonly string[] }): Promise<void> {
  const allowed =
    ctx.permissions.includes(PERMISSIONS.COMMUNICATION_SEND) ||
    (await hasPermissionServer(ctx.userId, PERMISSIONS.COMMUNICATION_SEND));
  if (!allowed) {
    throw createAuthError(403, "Nemáte oprávnenie na odosielanie správ.");
  }
}

/**
 * getCommitteeMessages – správy výboru vrátane vláknových odpovedí.
 * Vyžaduje `communication.view`.
 */
export async function getCommitteeMessages(limit = 50): Promise<CommitteeMessage[]> {
  const ctx = await requireAuthenticated();
  await assertView(ctx);

  const supabase = await createClient();

  const { data: tops, error: topError } = await supabase
    .from("committee_messages")
    .select(MESSAGE_SELECT)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (topError) {
    console.error("[getCommitteeMessages] Supabase error:", topError);
    throw createAuthError(500, "Chyba pri načítavaní správ výboru.");
  }

  const messages = ((tops ?? []) as Record<string, unknown>[]).map(mapMessage);
  if (messages.length === 0) return [];

  const ids = messages.map((m) => m.id);
  const { data: replyRows, error: replyError } = await supabase
    .from("committee_messages")
    .select(MESSAGE_SELECT)
    .in("parent_id", ids)
    .order("created_at", { ascending: true });
  if (replyError) {
    console.error("[getCommitteeMessages] replies error:", replyError);
    throw createAuthError(500, "Chyba pri načítavaní odpovedí.");
  }

  const replies = ((replyRows ?? []) as Record<string, unknown>[]).map(mapMessage);
  const byParent = new Map<string, CommitteeMessage[]>();
  for (const r of replies) {
    const list = byParent.get(r.parent_id ?? "") ?? [];
    list.push(r);
    byParent.set(r.parent_id ?? "", list);
  }
  for (const m of messages) {
    m.replies = byParent.get(m.id) ?? [];
  }
  return messages;
}

/**
 * resolveAuthorMemberId – member_id prihláseného používateľa (podpis správ).
 */
async function resolveAuthorMemberId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return ((data as { id?: string } | null)?.id ?? null) || null;
}

/**
 * postCommitteeMessage – pridá správu na nástenku výboru.
 * Vyžaduje `communication.send`.
 */
export async function postCommitteeMessage(content: string): Promise<CommitteeMessage> {
  const ctx = await requireAuthenticated();
  await assertSend(ctx);

  const text = content.trim();
  if (text.length === 0) throw createAuthError(400, "Správa nemôže byť prázdna.");
  if (text.length > 2000) throw createAuthError(400, "Správa je príliš dlhá (max. 2000 znakov).");

  const authorMemberId = await resolveAuthorMemberId(ctx.userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("committee_messages")
    .insert({ parent_id: null, author_member_id: authorMemberId, content: text } as never)
    .select(MESSAGE_SELECT)
    .single();
  if (error) {
    console.error("[postCommitteeMessage] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladaní správy.");
  }
  return mapMessage(data as Record<string, unknown>);
}

/**
 * postCommitteeReply – priama odpoveď / komentár na správu (vlákno).
 * Vyžaduje `communication.send`.
 */
export async function postCommitteeReply(
  parentId: string,
  content: string
): Promise<CommitteeMessage> {
  const ctx = await requireAuthenticated();
  await assertSend(ctx);

  const text = content.trim();
  if (text.length === 0) throw createAuthError(400, "Odpoveď nemôže byť prázdna.");
  if (text.length > 2000) throw createAuthError(400, "Odpoveď je príliš dlhá (max. 2000 znakov).");

  const authorMemberId = await resolveAuthorMemberId(ctx.userId);
  const supabase = await createClient();

  const { data: parent, error: parentError } = await supabase
    .from("committee_messages")
    .select("id")
    .eq("id", parentId)
    .is("parent_id", null)
    .maybeSingle();
  if (parentError) {
    console.error("[postCommitteeReply] parent error:", parentError);
    throw createAuthError(500, "Chyba pri overení správy.");
  }
  if (!parent) throw createAuthError(404, "Správa sa nenašla.");

  const { data, error } = await supabase
    .from("committee_messages")
    .insert({ parent_id: parentId, author_member_id: authorMemberId, content: text } as never)
    .select(MESSAGE_SELECT)
    .single();
  if (error) {
    console.error("[postCommitteeReply] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladaní odpovede.");
  }
  return mapMessage(data as Record<string, unknown>);
}

/**
 * deleteCommitteeMessage – vymazanie správy (RLS: autor alebo ADMIN).
 * Vyžaduje `communication.send`.
 */
export async function deleteCommitteeMessage(messageId: string): Promise<{ id: string }> {
  const ctx = await requireAuthenticated();
  await assertSend(ctx);

  const supabase = await createClient();
  const { error } = await supabase.from("committee_messages").delete().eq("id", messageId);
  if (error) {
    console.error("[deleteCommitteeMessage] Supabase error:", error);
    throw createAuthError(500, "Chyba pri mazaní správy.");
  }
  return { id: messageId };
}
