// Announcements Service – Server Authorization Layer
// K15 – Oznamy DHZ
//
// Architektúra: getAuthContext -> permission check -> Supabase RLS.

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { auditAnnouncement } from "@/lib/audit/audit.service";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateAnnouncement,
  validateAnnouncementUpdate,
  type AnnouncementInput,
  type AnnouncementUpdateInput,
} from "./announcements.validation";

// =============================================================================
// TYPY
// =============================================================================

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: string;
  published_at: string;
  expires_at: string | null;
  target_roles: string[] | null;
  is_pinned: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// =============================================================================
// AUTHENTICATION GUARD
// =============================================================================

async function requireAuthenticated(): Promise<AuthContext> {
  try {
    return await getAuthContext();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Unable to load authenticated user") ||
      message.includes("Session expired")
    ) {
      throw createAuthError(401, "Prihlásenie vypršalo alebo neplatí.");
    }
    throw error;
  }
}

async function assertPermission(ctx: AuthContext, permission: Permission): Promise<void> {
  const ok =
    ctx.permissions.includes(permission) || (await hasPermissionServer(ctx.userId, permission));
  if (!ok) {
    throw createAuthError(403, "Nemáte oprávnenie na túto operáciu.");
  }
}

const ANNOUNCEMENT_SELECT = "*";

// =============================================================================
// READ – getAnnouncements
// =============================================================================

export interface ListAnnouncementsFilters {
  active_only?: boolean;
  pinned_only?: boolean;
}

export async function getAnnouncements(
  filters?: ListAnnouncementsFilters
): Promise<Announcement[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.ANNOUNCEMENTS_VIEW);

  const supabase = await createClient();

  let query = supabase
    .from("announcements")
    .select(ANNOUNCEMENT_SELECT)
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false });

  if (filters?.active_only !== false) {
    const now = new Date().toISOString();
    query = query.eq("is_active", true).lte("published_at", now);
  }
  if (filters?.pinned_only) {
    query = query.eq("is_pinned", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getAnnouncements] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítaní oznámení.");
  }

  return (data ?? []) as Announcement[];
}

// =============================================================================
// READ – getAnnouncementById
// =============================================================================

export async function getAnnouncementById(announcementId: string): Promise<Announcement> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.ANNOUNCEMENTS_VIEW);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(ANNOUNCEMENT_SELECT)
    .eq("id", announcementId)
    .maybeSingle();

  if (error) {
    console.error("[getAnnouncementById] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítaní oznámenia.");
  }
  if (!data) throw createAuthError(404, "Oznámenie sa nenašlo.");

  return data as Announcement;
}

// =============================================================================
// WRITE – createAnnouncement
// =============================================================================

export async function createAnnouncement(input: AnnouncementInput): Promise<Announcement> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.ANNOUNCEMENTS_CREATE);

  const parsed = validateAnnouncement(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje oznámenia.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      ...parsed.data,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[createAnnouncement] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vytvorení oznámenia.");
  }

  const announcement = data as Announcement;
  await auditAnnouncement(ctx.userId, "create", announcement.id, {
    title: announcement.title,
    priority: announcement.priority,
  });
  return announcement;
}

// =============================================================================
// WRITE – updateAnnouncement
// =============================================================================

export async function updateAnnouncement(
  announcementId: string,
  input: AnnouncementUpdateInput
): Promise<Announcement> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.ANNOUNCEMENTS_EDIT);

  const parsed = validateAnnouncementUpdate(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje aktualizácie.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .update({
      ...parsed.data,
      updated_by: ctx.userId,
    } as never)
    .eq("id", announcementId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateAnnouncement] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Oznámenie sa nenašlo.");
    throw createAuthError(500, "Chyba pri aktualizácii oznámenia.");
  }

  const announcement = data as Announcement;
  await auditAnnouncement(ctx.userId, "update", announcement.id, {
    title: announcement.title,
    changes: parsed.data,
  });
  return announcement;
}

// =============================================================================
// WRITE – deleteAnnouncement
// =============================================================================

export async function deleteAnnouncement(announcementId: string): Promise<{ id: string }> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.ANNOUNCEMENTS_DELETE);

  const supabase = await createClient();

  const { data: rawData, error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId)
    .select("id, title")
    .single();

  if (error) {
    console.error("[deleteAnnouncement] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Oznámenie sa nenašlo.");
    throw createAuthError(500, "Chyba pri odstraňovaní oznámenia.");
  }

  const data = rawData as { id: string; title: string };
  await auditAnnouncement(ctx.userId, "delete", announcementId, {
    title: data.title,
  });
  return { id: announcementId };
}