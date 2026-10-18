// Work Parties Service – Server Authorization Layer
// Brigády DHZ
//
// Architektúra: getAuthContext -> permission check -> Supabase RLS.

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { auditWorkParty } from "@/lib/audit/audit.service";
import { createAuthError } from "@/lib/members/members.errors";
import {
  validateWorkParty,
  validateWorkPartyUpdate,
  type WorkPartyInput,
  type WorkPartyUpdateInput,
} from "./work-parties.validation";

// =============================================================================
// TYPY
// =============================================================================

export interface WorkParty {
  id: string;
  title: string;
  description: string | null;
  work_date: string;
  duration_hours: number;
  location: string | null;
  status: string;
  max_volunteers: number | null;
  notes: string | null;
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

const WORK_PARTY_SELECT = "*";

// =============================================================================
// READ – getWorkParties
// =============================================================================

export interface ListWorkPartiesFilters {
  upcoming_only?: boolean;
  status?: string;
}

export async function getWorkParties(filters?: ListWorkPartiesFilters): Promise<WorkParty[]> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.WORK_PARTIES_VIEW);

  const supabase = await createClient();

  let query = supabase
    .from("work_parties")
    .select(WORK_PARTY_SELECT)
    .order("work_date", { ascending: true });

  if (filters?.upcoming_only !== false) {
    const now = new Date().toISOString();
    query = query.gte("work_date", now);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getWorkParties] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítaní brigád.");
  }

  return (data ?? []) as WorkParty[];
}

// =============================================================================
// READ – getWorkPartyById
// =============================================================================

export async function getWorkPartyById(workPartyId: string): Promise<WorkParty> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.WORK_PARTIES_VIEW);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("work_parties")
    .select(WORK_PARTY_SELECT)
    .eq("id", workPartyId)
    .maybeSingle();

  if (error) {
    console.error("[getWorkPartyById] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítaní brigády.");
  }
  if (!data) throw createAuthError(404, "Brigáda sa nenašla.");

  return data as WorkParty;
}

// =============================================================================
// WRITE – createWorkParty
// =============================================================================

export async function createWorkParty(input: WorkPartyInput): Promise<WorkParty> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.WORK_PARTIES_CREATE);

  const parsed = validateWorkParty(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje brigády.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("work_parties")
    .insert({
      ...parsed.data,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[createWorkParty] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vytvorení brigády.");
  }

  const workParty = data as WorkParty;
  await auditWorkParty(ctx.userId, "create", workParty.id, {
    title: workParty.title,
    work_date: workParty.work_date,
    status: workParty.status,
  });
  return workParty;
}

// =============================================================================
// WRITE – updateWorkParty
// =============================================================================

export async function updateWorkParty(
  workPartyId: string,
  input: WorkPartyUpdateInput
): Promise<WorkParty> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.WORK_PARTIES_EDIT);

  const parsed = validateWorkPartyUpdate(input);
  if (!parsed.ok) {
    throw createAuthError(400, "Neplatné údaje aktualizácie.", parsed.errors);
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("work_parties")
    .update({
      ...parsed.data,
      updated_by: ctx.userId,
    })
    .eq("id", workPartyId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateWorkParty] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Brigáda sa nenašla.");
    throw createAuthError(500, "Chyba pri aktualizácii brigády.");
  }

  const workParty = data as WorkParty;
  await auditWorkParty(ctx.userId, "update", workParty.id, {
    title: workParty.title,
    changes: parsed.data,
  });
  return workParty;
}

// =============================================================================
// WRITE – deleteWorkParty
// =============================================================================

export async function deleteWorkParty(workPartyId: string): Promise<{ id: string }> {
  const ctx = await requireAuthenticated();
  await assertPermission(ctx, PERMISSIONS.WORK_PARTIES_DELETE);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("work_parties")
    .delete()
    .eq("id", workPartyId)
    .select("id, title")
    .single();

  if (error) {
    console.error("[deleteWorkParty] Supabase error:", error);
    if (error.code === "PGRST116") throw createAuthError(404, "Brigáda sa nenašla.");
    throw createAuthError(500, "Chyba pri odstraňovaní brigády.");
  }

  await auditWorkParty(ctx.userId, "delete", workPartyId, {
    title: data.title,
  });
  return { id: workPartyId };
}