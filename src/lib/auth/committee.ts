// =============================================================================
// Committee Member Authorization Helper
// =============================================================================
// K29.0: Server-side authorization for announcement module
// Verifies that the current user is an active committee member of DHZ Ružindol
// =============================================================================

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "./server";
import { createAuthError } from "@/lib/members/members.errors";

// =============================================================================
// Helper: Overova, či je používateľ aktuálnym členom výboru
// =============================================================================

export async function isCurrentCommitteeMember(memberId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("members")
    .select("is_committee_member, status")
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    console.error("[isCurrentCommitteeMember] Supabase error:", error);
    throw createAuthError(500, "Nepodarilo sa overiť členstvo vo výbore.");
  }
  if (!data) {
    return false;
  }

  return data.is_committee_member && data.status === "active";
}

// =============================================================================
// Server Action: RequireCommitteeMember
// Vyvolá 403, ak používateľ nie je aktívnym členom výboru
// =============================================================================

export async function requireCommitteeMember(): Promise<AuthContext> {
  const ctx = await getAuthContext();

  if (!ctx.memberId) {
    throw createAuthError(403, "Nemáte oprávnenie na túto operáciu.");
  }

  const isCommittee = await isCurrentCommitteeMember(ctx.memberId);
  if (!isCommittee) {
    throw createAuthError(403, "Túto operáciu môžu vykonať iba aktívni členovia výboru.");
  }

  return ctx;
}
