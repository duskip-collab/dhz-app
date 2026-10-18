// Meetings Service – Server Authorization Layer
// Porady DHZ
//
// Architektúra: getAuthContext -> permission check -> Supabase RLS.

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { auditMeeting } from "@/lib/audit/audit.service";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateMeeting,
  validateMeetingUpdate,
  type MeetingInput,
  type MeetingUpdateInput,
} from "./meetings.validation";

// =============================================================================
// TYPY
// =============================================================================

export interface Meeting {
  id: string;
  title: string;
  description: string | null;
  meeting_type: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  agenda: string | null;
  minutes: string | null;
  is_remote: boolean;
  remote_link: string | null;
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

const MEETING_SELECT = "*";

// =============================================================================
// READ – getMeetings
// =============================================================================

export interface ListMeetingsFilters {
  upcoming_only?: boolean;
  meeting_type?: string;
}

export async function getMeetings(filters?: ListMeetingsFilters): Promise<Meeting[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.MEETINGS_VIEW);

  const supabase = await createClient();

  let query = supabase
    .from("meetings")
    .select(MEETING_SELECT)
    .order("scheduled_at", { ascending: true });

  if (filters?.upcoming_only !== false) {
    const now = new Date().toISOString();
    query = query.gte("scheduled_at", now);
  }
  if (filters?.meeting_type) {
    query = query.eq("meeting_type", filters.meeting_type);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getMeetings] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítaní porad.");
  }

  return (data ?? []) as Meeting[];
}

// =============================================================================
// READ – getMeetingById
// =============================================================================

export async function getMeetingById(meetingId: string): Promise<Meeting> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.MEETINGS_VIEW);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meetings")
    .select(MEETING_SELECT)
    .eq("id", meetingId)
    .maybeSingle();

  if (error) {
    console.error("[getMeetingById] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítaní porady.");
  }
  if (!data) throw createAuthError(404, "Porada sa nenašla.");

  return data as Meeting;
}

// =============================================================================
// WRITE – createMeeting
// =============================================================================

export async function createMeeting(input: MeetingInput): Promise<Meeting> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.MEETINGS_CREATE);

  const parsed = validateMeeting(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje porady.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      ...parsed.data,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[createMeeting] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vytvorení porady.");
  }

  const meeting = data as Meeting;
  await auditMeeting(ctx.userId, "create", meeting.id, {
    title: meeting.title,
    meeting_type: meeting.meeting_type,
    scheduled_at: meeting.scheduled_at,
  });
  return meeting;
}

// =============================================================================
// WRITE – updateMeeting
// =============================================================================

export async function updateMeeting(
  meetingId: string,
  input: MeetingUpdateInput
): Promise<Meeting> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.MEETINGS_EDIT);

  const parsed = validateMeetingUpdate(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje aktualizácie.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meetings")
    .update({
      ...parsed.data,
      updated_by: ctx.userId,
    })
    .eq("id", meetingId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateMeeting] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Porada sa nenašla.");
    throw createAuthError(500, "Chyba pri aktualizácii porady.");
  }

  const meeting = data as Meeting;
  await auditMeeting(ctx.userId, "update", meeting.id, {
    title: meeting.title,
    changes: parsed.data,
  });
  return meeting;
}

// =============================================================================
// WRITE – deleteMeeting
// =============================================================================

export async function deleteMeeting(meetingId: string): Promise<{ id: string }> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.MEETINGS_DELETE);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meetings")
    .delete()
    .eq("id", meetingId)
    .select("id, title")
    .single();

  if (error) {
    console.error("[deleteMeeting] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Porada sa nenašla.");
    throw createAuthError(500, "Chyba pri odstraňovaní porady.");
  }

  await auditMeeting(ctx.userId, "delete", meetingId, {
    title: data.title,
  });
  return { id: meetingId };
}