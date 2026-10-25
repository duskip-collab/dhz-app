"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createMember,
  createMemberGuardian,
  deleteMember,
  deleteMemberGuardian,
  type MemberGuardian,
  updateMember,
  updateMemberGuardian,
} from "@/lib/members/members.service";
import {
  createMemberInputFromForm,
  guardianInputFromForm,
  isMembershipType,
  isMemberStatus,
  requiresGuardian,
  updateMemberInputFromForm,
  validateCreateMember,
  validateGuardian,
  validateUpdateMember,
} from "@/features/members/schemas/member.validation";

export type ActionState =
  | { ok: true; memberId?: string; guardian?: MemberGuardian; guardianId?: string }
  | { ok: false; errors: Record<string, string>; message: string };

function field(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}

/** Prečítanie checkbox hodnôt (prítomný => "on" / "true"). */
function boolField(formData: FormData, name: string): boolean {
  const raw = formData.get(name);
  return raw === "on" || raw === "true" || raw === "1";
}

/** Prečítanie všetkých polí člena z FormData. */
function memberFields(formData: FormData) {
  return {
    member_number: field(formData, "member_number"),
    first_name: field(formData, "first_name"),
    last_name: field(formData, "last_name"),
    title: field(formData, "title"),
    rank: field(formData, "rank"),
    position: field(formData, "position"),
    is_committee_member: boolField(formData, "is_committee_member"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    birth_date: field(formData, "birth_date"),
    address: field(formData, "address"),
    membership_type: field(formData, "membership_type"),
    status: field(formData, "status"),
    joined_at: field(formData, "joined_at"),
    notes: field(formData, "notes"),
  };
}

/** Prečítanie polí zástupcu z FormData. */
function guardianFields(formData: FormData) {
  return {
    guardian_name: field(formData, "guardian_name"),
    guardian_phone: field(formData, "guardian_phone"),
    guardian_relationship: field(formData, "guardian_relationship"),
    guardian_email: field(formData, "guardian_email"),
  };
}

/** Spoločná validácia enum hodnôt typu a stavu (ochrana pred neplatnými/upravenými hodnotami). */
function enumErrors(raw: {
  membership_type?: string | null;
  status?: string | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (raw.membership_type !== null && raw.membership_type !== undefined && !isMembershipType(raw.membership_type)) {
    errors.membership_type = "Neplatná kategória člena.";
  }
  if (raw.status !== null && raw.status !== undefined && !isMemberStatus(raw.status)) {
    errors.status = "Neplatný stav člena.";
  }
  return errors;
}

export async function createMemberAction(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const raw = memberFields(formData);

  const enumErrorsRecord = enumErrors(raw);
  if (Object.keys(enumErrorsRecord).length > 0) {
    return { ok: false, errors: enumErrorsRecord, message: "Skontrolujte zvýraznené polia." };
  }

  const input = createMemberInputFromForm(raw);
  const parsed = validateCreateMember(input);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors, message: "Skontrolujte zvýraznené polia." };
  }

  // Zákonný zástupca – povinný pre mládežnícke kategórie.
  const guardian = guardianInputFromForm(guardianFields(formData));

  if (requiresGuardian(parsed.data.membership_type) && !guardian) {
    return {
      ok: false,
      errors: { guardian_name: "Zákonný zástupca je povinný pre mládež." },
      message: "Doplňte zákonného zástupcu.",
    };
  }
  if (guardian) {
    const gv = validateGuardian(guardian);
    if (!gv.ok) {
      return { ok: false, errors: gv.errors, message: "Doplňte zákonného zástupcu." };
    }
  }

  try {
    const member = await createMember(parsed.data);

    // POZNÁMKA K ATOMICITE: člen a zástupca sa zapisujú dvoma nezávislými
    // Supabase volaniami (PostgREST); transakcia nie je garantovaná. Zástupca
    // je najprv validovaný a createMemberGuardian je idempotentný.
    if (guardian) {
      await createMemberGuardian(member.id, {
        relationship: guardian.relationship,
        is_primary_contact: true,
        phone: guardian.phone,
        email: guardian.email,
        guardian_full_name: guardian.full_name,
      });
    }

    revalidatePath("/members");
    return { ok: true, memberId: member.id };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    const msg = e instanceof Error ? e.message : "Chyba pri vytváraní člena.";
    if (status === 403) return { ok: false, errors: {}, message: "Nemáte oprávnenie." };
    if (status === 400) return { ok: false, errors: {}, message: msg };
    return { ok: false, errors: {}, message: "Chyba pri vytváraní člena." };
  }
}
export async function updateMemberAction(
  memberId: string,
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const raw = memberFields(formData);

  const enumErrorsRecord = enumErrors(raw);
  if (Object.keys(enumErrorsRecord).length > 0) {
    return { ok: false, errors: enumErrorsRecord, message: "Skontrolujte zvýraznené polia." };
  }

  // Uložia sa IBA polia odoslané formulárom; nepoužité údaje sa nemenia.
  const payload = updateMemberInputFromForm(raw);
  const parsed = validateUpdateMember(payload);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors, message: "Skontrolujte zvýraznené polia." };
  }

  try {
    await updateMember(memberId, parsed.data);
    revalidatePath("/members");
    revalidatePath(`/members/${memberId}`);
    return { ok: true, memberId };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    if (status === 403) return { ok: false, errors: {}, message: "Nemáte oprávnenie." };
    if (status === 404) return { ok: false, errors: {}, message: "Člen sa nenašiel." };
    const msg = e instanceof Error ? e.message : "";
    if (status === 400 && msg) return { ok: false, errors: {}, message: msg };
    return { ok: false, errors: {}, message: "Chyba pri ukladaní člena." };
  }
}

export async function archiveMemberAction(memberId: string): Promise<ActionState> {
  const { archiveMember } = await import("@/lib/members/members.service");
  try {
    await archiveMember(memberId);
    revalidatePath("/members");
    revalidatePath(`/members/${memberId}`);
    return { ok: true, memberId };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    if (status === 409) return { ok: false, errors: {}, message: "Člen už je archivovaný." };
    if (status === 404) return { ok: false, errors: {}, message: "Člen sa nenašiel." };
    if (status === 403) return { ok: false, errors: {}, message: "Nemáte oprávnenie." };
    return { ok: false, errors: {}, message: "Chyba pri archivovaní." };
  }
}

export async function reactivateMemberAction(memberId: string): Promise<ActionState> {
  const { reactivateMember } = await import("@/lib/members/members.service");
  try {
    await reactivateMember(memberId);
    revalidatePath("/members");
    revalidatePath(`/members/${memberId}`);
    return { ok: true, memberId };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    if (status === 404) return { ok: false, errors: {}, message: "Člen sa nenašiel." };
    if (status === 403) return { ok: false, errors: {}, message: "Nemáte oprávnenie." };
    if (status === 409) return { ok: false, errors: {}, message: "Člen už je aktívny." };
    return { ok: false, errors: {}, message: "Chyba pri reaktivácii." };
  }
}
export async function createGuardianAction(
  memberId: string,
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const guardian = guardianInputFromForm(guardianFields(formData));
  if (!guardian) {
    return { ok: false, errors: {}, message: "Vyplňte meno, vzťah a telefón zástupcu." };
  }

  const parsed = validateGuardian(guardian);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors, message: "Doplňte zástupcu." };
  }

  try {
    const created = await createMemberGuardian(memberId, {
      relationship: parsed.data.relationship,
      is_primary_contact: true,
      phone: parsed.data.phone,
      email: parsed.data.email,
      guardian_full_name: parsed.data.full_name,
    });
    revalidatePath(`/members/${memberId}`);
    return { ok: true, memberId, guardian: created };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    if (status === 403) return { ok: false, errors: {}, message: "Nemáte oprávnenie." };
    if (status === 400) {
      const msg = e instanceof Error ? e.message : "Chyba pri ukladaní zástupcu.";
      return { ok: false, errors: {}, message: msg };
    }
    return { ok: false, errors: {}, message: "Chyba pri ukladaní zástupcu." };
  }
}

export async function updateGuardianAction(
  memberId: string,
  guardianId: string,
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const guardian = guardianInputFromForm(guardianFields(formData));
  if (!guardian) {
    return { ok: false, errors: {}, message: "Vyplňte meno, vzťah a telefón zástupcu." };
  }

  const parsed = validateGuardian(guardian);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors, message: "Doplňte zástupcu." };
  }

  try {
    const updated = await updateMemberGuardian(memberId, guardianId, {
      relationship: parsed.data.relationship,
      is_primary_contact: true,
      phone: parsed.data.phone,
      email: parsed.data.email,
      guardian_full_name: parsed.data.full_name,
    });
    revalidatePath(`/members/${memberId}`);
    return { ok: true, memberId, guardian: updated };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    if (status === 403) return { ok: false, errors: {}, message: "Nemáte oprávnenie." };
    if (status === 404) return { ok: false, errors: {}, message: "Zástupca sa nenašiel." };
    const msg = e instanceof Error ? e.message : "";
    if (status === 400 && msg) return { ok: false, errors: {}, message: msg };
    return { ok: false, errors: {}, message: "Chyba pri ukladaní zástupcu." };
  }
}

export async function deleteGuardianAction(
  memberId: string,
  guardianId: string
): Promise<ActionState> {
  try {
    await deleteMemberGuardian(memberId, guardianId);
    revalidatePath(`/members/${memberId}`);
    return { ok: true, memberId, guardianId };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    if (status === 403) return { ok: false, errors: {}, message: "Nemáte oprávnenie." };
    return { ok: false, errors: {}, message: "Chyba pri odstraňovaní zástupcu." };
  }
}

const PHOTO_BUCKET = "member-photos";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadMemberPhotoAction(
  memberId: string,
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errors: { photo: "Vyberte fotografiu." }, message: "Vyberte fotografiu." };
  }
  if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
    return { ok: false, errors: { photo: "Povolené sú JPG, PNG, WebP." }, message: "Nepodporovaný formát." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, errors: { photo: "Maximálna veľkosť je 5 MB." }, message: "Fotografia je príliš veľká." };
  }

  try {
    const { getAuthContext, hasPermissionServer } = await import("@/lib/auth/server");
    const { PERMISSIONS } = await import("@/lib/auth/permissions");
    const { getMemberById, updateMember } = await import("@/lib/members/members.service");
    const { createClient } = await import("@/lib/supabase/server");

    const ctx = await getAuthContext();
    const ok =
      ctx.permissions.includes(PERMISSIONS.MEMBERS_EDIT) ||
      (await hasPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_EDIT));
    if (!ok) return { ok: false, errors: {}, message: "Nemáte oprávnenie." };

    await getMemberById(memberId);

    const supabase = await createClient();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${memberId}/${Date.now()}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) {
      return { ok: false, errors: { photo: "Nahrávanie zlyhalo." }, message: "Nahrávanie zlyhalo." };
    }

    await updateMember(memberId, { photo_path: path });

    revalidatePath("/members");
    revalidatePath(`/members/${memberId}`);
    return { ok: true, memberId };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 403) {
      return { ok: false, errors: {}, message: "Nemáte oprávnenie." };
    }
    return { ok: false, errors: {}, message: "Nahrávanie zlyhalo." };
  }
}

// =============================================================================
// DELETE MEMBER – trvalé vymazanie člena (vyžaduje members.delete).
// Používa sa cez potvrdzovací modál na detaile člena.
// =============================================================================

export async function deleteMemberAction(formData: FormData): Promise<void> {
  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) {
    const params = new URLSearchParams({ error: "Chýba identifikátor člena." });
    redirect(`/members?${params.toString()}`);
  }

  try {
    await deleteMember(memberId);
    revalidatePath("/members");
    const params = new URLSearchParams({ success: "Člen bol trvale vymazaný." });
    redirect(`/members?${params.toString()}`);
  } catch (e) {
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    const message =
      status === 403
        ? "Nemáte oprávnenie members.delete."
        : status === 404
          ? "Člen sa nenašiel."
          : e instanceof Error && e.message
            ? e.message
            : "Chyba pri vymazávaní člena.";
    const params = new URLSearchParams({ error: message });
    redirect(`/members?${params.toString()}`);
  }
}