// Member Functions Service – server-side data layer for member functional assignments
// C6.2
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermissionServer } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { logSecurityEvent, AUDIT_ACTIONS } from "@/lib/audit/audit.service";
import { createAuthError } from "./members.errors";

const UUID = z.string().uuid();

const AssignInput = z.object({
  function_code: z.string().min(1),
  valid_from: z.string().date().optional(),
  valid_to: z.string().date().nullable().optional(),
  notes: z.string().max(500).optional(),
});

const EndInput = z.object({
  valid_to: z.string().date(),
});

async function getCtx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw createAuthError(401, "Nie ste prihlásený");
  return { supabase, userId: user.id };
}

async function requirePerm(ctx: { userId: string }, perm: string) {
  const ok = await hasPermissionServer(ctx.userId, perm as never);
  if (!ok) throw createAuthError(403, "Nedostatočné oprávnenie");
}

export async function getMemberFunctionCatalog() {
  const ctx = await getCtx();
  await requirePerm(ctx, PERMISSIONS.MEMBERS_VIEW);
  const { data, error } = await ctx.supabase
    .from("member_function_catalog" as never)
    .select("*")
    .order("code" as never);
  if (error) throw error;
  return data ?? [];
}

export async function getMemberFunctions(memberId: string) {
  UUID.parse(memberId);
  const ctx = await getCtx();
  await requirePerm(ctx, PERMISSIONS.MEMBERS_VIEW);
  const { data, error } = await ctx.supabase
    .from("member_function_assignments" as never)
    .select("*, member_function_catalog(*)")
    .eq("member_id" as never, memberId)
    .order("valid_from" as never, { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function assignMemberFunction(memberId: string, input: unknown) {
  UUID.parse(memberId);
  const parsed = AssignInput.parse(input);
  const ctx = await getCtx();
  await requirePerm(ctx, PERMISSIONS.MEMBERS_EDIT);

  const { data: member, error: mErr } = await ctx.supabase
    .from("members" as never)
    .select("id,status")
    .eq("id" as never, memberId)
    .single();
  if (mErr || !member) throw createAuthError(404, "Člen neexistuje");
  if ((member as { status: string }).status !== "active") {
    throw createAuthError(409, "Člen nie je aktívny");
  }

  const { data: fn, error: fErr } = await ctx.supabase
    .from("member_function_catalog" as never)
    .select("code,is_active")
    .eq("code" as never, parsed.function_code)
    .single();
  if (fErr || !fn || !(fn as { is_active: boolean }).is_active) {
    throw createAuthError(404, "Funkcia neexistuje alebo je neaktívna");
  }

  const validFrom = parsed.valid_from ?? new Date().toISOString().slice(0, 10);
  if (parsed.valid_to && parsed.valid_to < validFrom) {
    throw createAuthError(400, "valid_to nesmie byť pred valid_from");
  }

  const { data: existing } = await ctx.supabase
    .from("member_function_assignments" as never)
    .select("id")
    .eq("member_id" as never, memberId)
    .eq("function_code" as never, parsed.function_code)
    .is("valid_to" as never, null);
  if (existing && (existing as unknown[]).length > 0) {
    throw createAuthError(409, "Aktívne zaradenie už existuje");
  }

  const { data: created, error: cErr } = await ctx.supabase
    .from("member_function_assignments" as never)
    .insert({
      member_id: memberId,
      function_code: parsed.function_code,
      assigned_by: ctx.userId,
      valid_from: validFrom,
      valid_to: parsed.valid_to ?? null,
      notes: parsed.notes ?? null,
    } as never)
    .select("*")
    .single();
  if (cErr) {
    if ((cErr as { code?: string }).code === "23505") {
      throw createAuthError(409, "Aktívne zaradenie už existuje");
    }
    throw cErr;
  }


  await logSecurityEvent({
    userId: ctx.userId,
    module: "members",
    action: AUDIT_ACTIONS.UPDATE,
    objectId: (created as { id: string }).id,
    data: { member_id: memberId, function_code: parsed.function_code },
  });
  return created;
}

export async function endMemberFunction(assignmentId: string, validTo: string) {
  UUID.parse(assignmentId);
  const parsed = EndInput.parse({ valid_to: validTo });
  const ctx = await getCtx();
  await requirePerm(ctx, PERMISSIONS.MEMBERS_EDIT);

  const { data: row, error: rErr } = await ctx.supabase
    .from("member_function_assignments" as never)
    .select("*")
    .eq("id" as never, assignmentId)
    .single();
  if (rErr || !row) throw createAuthError(404, "Zaradenie neexistuje");
  const r = row as { valid_from: string; valid_to: string | null };
  if (r.valid_to !== null) {
    throw createAuthError(409, "Zaradenie už je ukončené");
  }
  if (parsed.valid_to < r.valid_from) {
    throw createAuthError(400, "valid_to nesmie byť pred valid_from");
  }

  const { data: updated, error: uErr } = await ctx.supabase
    .from("member_function_assignments" as never)
    .update({ valid_to: parsed.valid_to } as never)
    .eq("id" as never, assignmentId)
    .select("*")
    .single();
  if (uErr) throw uErr;

  await logSecurityEvent({
    userId: ctx.userId,
    module: "members",
    action: AUDIT_ACTIONS.UPDATE,
    objectId: assignmentId,
    data: { valid_to: parsed.valid_to },
  });
  return updated;
}
