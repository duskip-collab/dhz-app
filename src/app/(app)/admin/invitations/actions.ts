// K17.5 – Server Actions pre správu pozývacích kódov.
//
// BEZPEČNOSTNÉ ZÁSADY:
//  - Všetky akcie sú fail-closed (`admin.users`); zhoda s DB RPC.
//  - Raw pozývací kód sa vracia IBA raz – v odpovedi `createInvitationAction`.
//  - Chybové hlásky neodhalujú, či kód existoval.

"use server";

import { revalidatePath } from "next/cache";
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from "@/lib/auth/invitations.service";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server";
import { isAppRole, type AppRole } from "@/lib/auth/roles";
import {
  INVITATION_MAX_USES_LIMIT,
  type Invitation,
} from "@/lib/auth/invitations.types";

export type InvitationActionState =
  | {
      ok: true;
      message?: string;
      /** Raw kód – zobrazí sa RAZ v dialógu, potom sa odstráni zo stavu. */
      code?: string;
      invitation?: Invitation;
    }
  | { ok: false; message: string };

function fail(message: string): InvitationActionState {
  return { ok: false, message };
}

function statusMessage(e: unknown, fallback: string): string {
  const status = (e as { statusCode?: number })?.statusCode ?? 500;
  if (status === 403) return "Nemáte oprávnenie na správu pozývacích kódov.";
  if (status === 400) return e instanceof Error ? e.message : fallback;
  return fallback;
}

/**
 * createInvitationAction – vytvorí novú pozvánku.
 *
 * FormData: role, valid_days, max_uses, target_email, notes
 */
export async function createInvitationAction(
  _prev: InvitationActionState | null,
  formData: FormData,
): Promise<InvitationActionState> {
  await requirePermission(PERMISSIONS.ADMIN_USERS);

  const role = String(formData.get("role") ?? "").trim();
  if (!isAppRole(role)) {
    return fail("Vyberte platnú rolu.");
  }

  const validDaysRaw = String(formData.get("valid_days") ?? "").trim();
  const validDays = validDaysRaw ? Number.parseInt(validDaysRaw, 10) : undefined;
  if (validDaysRaw && (!Number.isFinite(validDays) || validDays! < 1 || validDays! > 365)) {
    return fail("Neplatná platnosť kódu (1 – 365 dní).");
  }

  const maxUsesRaw = String(formData.get("max_uses") ?? "").trim();
  const maxUses = maxUsesRaw ? Number.parseInt(maxUsesRaw, 10) : undefined;
  if (
    maxUsesRaw &&
    (!Number.isFinite(maxUses) || maxUses! < 1 || maxUses! > INVITATION_MAX_USES_LIMIT)
  ) {
    return fail(`Neplatný počet použití kódu (1 – ${INVITATION_MAX_USES_LIMIT}).`);
  }

  const targetEmailRaw = String(formData.get("target_email") ?? "").trim();
  const notesRaw = String(formData.get("notes") ?? "").trim();

  try {
    const created = await createInvitation({
      role: role as AppRole,
      validDays,
      maxUses,
      targetEmail: targetEmailRaw ? targetEmailRaw : null,
      notes: notesRaw ? notesRaw : null,
    });

    revalidatePath("/admin/invitations");

    return {
      ok: true,
      message: "Pozvánka bola vytvorená.",
      code: created.code,
      invitation: created.invitation,
    };
  } catch (e) {
    return fail(statusMessage(e, "Pozvánku sa nepodarilo vytvoriť."));
  }
}

/**
 * revokeInvitationAction – zruší pozvánku (soft delete).
 */
export async function revokeInvitationAction(
  _prev: InvitationActionState | null,
  formData: FormData,
): Promise<InvitationActionState> {
  await requirePermission(PERMISSIONS.ADMIN_USERS);

  const id = String(formData.get("invitation_id") ?? "").trim();
  if (!id) return fail("Chýba identifikátor pozvánky.");

  try {
    await revokeInvitation(id);
    revalidatePath("/admin/invitations");
    return { ok: true, message: "Pozvánka bola zrušená." };
  } catch (e) {
    return fail(statusMessage(e, "Pozvánku sa nepodarilo zrušiť."));
  }
}

/**
 * listInvitationsAction – prehľad pozvánok pre admina.
 */
export async function listInvitationsAction(): Promise<Invitation[]> {
  await requirePermission(PERMISSIONS.ADMIN_USERS);
  return listInvitations();
}