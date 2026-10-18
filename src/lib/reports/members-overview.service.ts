// Members Overview Report — Server Service
// K13.3.1 – Reports Foundation
//
// Serverová implementácia pilotného reportu R1 (Prehľad členov).
//
// Finančné údaje sa tu nijako nenačítavajú.
// Bezpečnostný model (defense-in-depth):
//   1) `getAuthContext()` overí prihlásenie (neprihlásený → redirect /login),
//   2) explicitná AND kontrola — report vyžaduje `reports.view` **A**
//      `members.view`. `reports.view` samotné NESTAČÍ (pozri katalóg).
//   3) čítanie prebieha cez štandardný serverový Supabase klient (RLS) —
//      NEPOUŽÍVA service-role, neobchádza RLS.

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermissionServer } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { createAuthError } from "@/lib/members/members.errors";
import {
  summarizeMembers,
  type MemberSummaryRow,
  type MembersOverviewSummary,
} from "./reports.core";

// Pre-re-export typu pre UI (stránka importuje summary typ odtiaľto).
export type { MembersOverviewSummary } from "./reports.core";

/** Oprávnenia potrebné na tento report (logika AND). */
const MEMBERS_OVERVIEW_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.MEMBERS_VIEW,
];

/**
 * Overí, že prihlásený používateľ má VŠETKY oprávnenia reportu.
 * Kontrola je AND — chýbajúce hociktoré oprávnenie = zamietnutie.
 * Defense-in-depth: okrem kontextu sa overí aj cez RPC `has_permission`.
 */
async function authorizeMembersOverview(): Promise<void> {
  const ctx = await getAuthContext();

  const missing = MEMBERS_OVERVIEW_PERMISSIONS.filter(
    (permission) => !ctx.permissions.includes(permission),
  );
  if (missing.length > 0) {
    throw createAuthError(403, "Nemáte oprávnenie na tento report.");
  }

  // Druhá línia obrany — potvrdenie cez server RPC pre obe oprávnenia.
  for (const permission of MEMBERS_OVERVIEW_PERMISSIONS) {
    const allowed = await hasPermissionServer(ctx.userId, permission);
    if (!allowed) {
      throw createAuthError(403, "Nemáte oprávnenie na tento report.");
    }
  }
}

/**
 * Vráti agregovaný prehľad členov. Bez filtra dátumu — report nepotrebuje
 * obdobie. Prázdny výsledok sa spracuje korektne (samé nuly, žiadna chyba).
 *
 * @throws AuthError 401/403 pri chýbajúcej autorizácii.
 */
export async function getMembersOverview(): Promise<MembersOverviewSummary> {
  await authorizeMembersOverview();

  const supabase = await createClient();

  // Načítame iba stĺpce potrebné pre agregáciu (minimalizácia dát).
  // RLS na `members` stále platí — bez `members.view` používateľ nedostane riadky.
  const { data, error } = await supabase
    .from("members")
    .select("membership_type, status");

  if (error) {
    console.error("[getMembersOverview] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní prehľadu členov.");
  }

  return summarizeMembers((data ?? []) as MemberSummaryRow[]);
}
