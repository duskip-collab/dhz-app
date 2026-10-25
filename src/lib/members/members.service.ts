// Members Service - Server Authorization Layer
// K8.2 – Members Server Auth & Permission Layer
// 
// Táto vrstva poskytuje bezpečné server-side operácie pre modul Členovia.
// Používa existujúcu architektúru: getAuthContext -> permission check -> Supabase RLS.

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { auditMemberCreate, auditMemberUpdate, auditMemberArchive, logSecurityEvent, AUDIT_MODULES, AUDIT_ACTIONS } from "@/lib/audit/audit.service";
import { createAuthError } from "./members.errors";
import {
  findDuplicateGuardian,
  isMembershipType,
  isMemberStatus,
  isValidEmail,
  isValidPhone,
} from "@/features/members/schemas/member.validation";

// =============================================================================
// TYPY
// =============================================================================

export type MembershipType = "adult" | "youth" | "preparatory" | "dorast";
export type MemberStatus = "active" | "inactive";

export interface Member {
  id: string;
  auth_user_id: string | null;
  member_number: string;
  first_name: string;
  last_name: string;
  title: string | null;
  rank: string | null;
  position: string | null;
  is_committee_member: boolean;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  address: string | null;
  membership_type: MembershipType;
  status: MemberStatus;
  joined_at: string;
  left_at: string | null;
  notes: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface MemberGuardian {
  id: string;
  member_id: string;
  user_id: string | null;
  relationship: string;
  guardian_full_name: string;
  is_primary_contact: boolean;
  phone: string | null;
  email: string | null;
  created_at: string;
  created_by: string | null;
}

export interface MemberWithRelations extends Member {
  guardian_count: number;
}

export interface ListMembersParams {
  membership_type?: MembershipType;
  status?: MemberStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// AUTHENTICATION GUARD
// =============================================================================

/**
 * Authentication guard: overí, či je používateľ prihlásený.
 * Ak nie - vyhodí 401 chybu.
 */
export async function requireAuthenticated(): Promise<AuthContext> {
  try {
    const ctx = await getAuthContext();
    return ctx;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unable to load authenticated user") || message.includes("Session expired") || message.includes("redirect")) {
      throw createAuthError(401, "Prihlasenie vypršalo alebo neplatí.");
    }
    throw error;
  }
}

// =============================================================================
// PERMISSION CHECKS
// =============================================================================

/**
 * overí, či používateľ má permission, poriadne načítaný (z ctx)
 */
export function checkPermission(ctx: AuthContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}

/**
 * Server-side permission check – volá Supabase RPC has_permission
 */
export async function checkPermissionServer(
  userId: string,
  permission: Permission
): Promise<boolean> {
  try {
    const result = await hasPermissionServer(userId, permission);
    return result === true;
  } catch (error) {
    console.error("[checkPermissionServer]", error);
    return false;
  }
}


/**
 * listMembers – Virtuálne zoznam členov na serveri.
 * DOPLNI "READ"
 */
export async function listMembers(
  params: ListMembersParams = {}
): Promise<Member[]> {
  const ctx = await requireAuthenticated();

  // Authorization check – members.view
  const hasView = checkPermission(ctx, PERMISSIONS.MEMBERS_VIEW) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_VIEW));

  if (!hasView) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie členov.");
  }

  const supabase = await createClient();

  let query = supabase
    .from("members")
    .select("*");

  // Priepínanie filtrov
  if (params.membership_type) {
    query = query.eq("membership_type", params.membership_type);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.search) {
    query = query.or(`first_name.ilike.*${params.search}*,last_name.ilike.*${params.search}*`);
  }

  const { data, error, status, statusText } = await query;

  if (error) {
    console.error("[listMembers] Supabase error", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      status,
      statusText,
    });
    throw createAuthError(500, "Chyba pri načítavaní členov.");
  }

  return (data || []) as Member[];
}

/**
 * getMember – Získanie jedného člena podľa ID.
 * DOPLNI "READ"
 */
export async function getMember(
  memberId: string
): Promise<Member> {
  const ctx = await requireAuthenticated();

  // Authorization check – members.view
  const hasView = checkPermission(ctx, PERMISSIONS.MEMBERS_VIEW) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_VIEW));

  if (!hasView) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie člena.");
  }

  const supabase = await createClient();

  const { data, error, status } = await supabase
    .from("members")
    .select("*")
    .eq("id", memberId)
    .single();

  if (error) {
    console.error("[getMember] Supabase error:", error);
    // 404 ak člena nenájdené
    if (status === 406 || status === 404) {
      throw createAuthError(404, "Člen sa nenájde.");
    }
    throw createAuthError(500, "Chyba pri načítavaní člena.");
  }

  return data as Member;
}


/**
 * createMember – Vytvorenie nového člena.
 * DOPLNI "CREATE"
 */
export async function createMember(
  data: {
    member_number: string;
    first_name: string;
    last_name: string;
    title?: string | null;
    rank?: string | null;
    position?: string | null;
    is_committee_member?: boolean;
    phone?: string | null;
    email?: string | null;
    birth_date?: string | null;
    address?: string | null;
    membership_type?: MembershipType;
    status?: MemberStatus;
    joined_at?: string;
    notes?: string | null;
    photo_path?: string | null;
    created_by?: string | null;
  }
): Promise<Member> {
  const ctx = await requireAuthenticated();

  // Authorization check – members.create
  const hasCreate = checkPermission(ctx, PERMISSIONS.MEMBERS_CREATE) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_CREATE));

  if (!hasCreate) {
    throw createAuthError(403, "Nemáte oprávnenie na vytvorenie člena.");
  }

  // Validácia povinných polí
  if (!data.member_number || !data.first_name || !data.last_name) {
    throw createAuthError(400, "Povinné polia: member_number, first_name, last_name.");
  }

  // Server-side (authoritatívna) validácia enum hodnôt a formátov.
  // Klient validuje pre UX; táto vrstva odmieta priame/neplatné vstupy.
  if (data.membership_type !== undefined && !isMembershipType(data.membership_type)) {
    throw createAuthError(400, "Neplatná kategória člena.");
  }
  if (data.status !== undefined && !isMemberStatus(data.status)) {
    throw createAuthError(400, "Neplatný stav člena.");
  }
  if (data.email !== undefined && !isValidEmail(data.email)) {
    throw createAuthError(400, "Email nemá platný formát.");
  }
  if (data.phone !== undefined && !isValidPhone(data.phone)) {
    throw createAuthError(400, "Telefón nemá platný formát.");
  }

  const supabase = await createClient();

  const { data: rawMember, error } = await supabase
    .from("members")
    .insert({
      member_number: data.member_number,
      first_name: data.first_name,
      last_name: data.last_name,
      title: data.title ?? null,
      rank: data.rank ?? null,
      position: data.position ?? null,
      is_committee_member: data.is_committee_member ?? false,
      phone: data.phone ?? null,
      email: data.email ?? null,
      birth_date: data.birth_date ?? null,
      address: data.address ?? null,
      membership_type: data.membership_type ?? "adult",
      status: data.status ?? "active",
      joined_at: data.joined_at ?? new Date().toISOString(),
      notes: data.notes ?? null,
      photo_path: data.photo_path ?? null,
      created_by: data.created_by ?? ctx.userId,
    } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[createMember] Supabase error:", error);
    const dbMsg = error.message ?? "";
    throw createAuthError(500, `Chyba pri vytvorení člena: ${dbMsg}`);
  }

  const member = rawMember as Member;

  // Audit
  await auditMemberCreate(ctx.userId, {
    id: member.id,
    member_number: member.member_number,
    first_name: member.first_name,
    last_name: member.last_name,
  });

  return member;
}

/**
 * updateMember – Upravenie člena.
 * DOPLNI "EDIT"
 */
export async function updateMember(
  memberId: string,
  data: {
    first_name?: string;
    last_name?: string;
    title?: string | null;
    rank?: string | null;
    position?: string | null;
    is_committee_member?: boolean;
    phone?: string | null;
    email?: string | null;
    birth_date?: string | null;
    address?: string | null;
    membership_type?: MembershipType;
    status?: MemberStatus;
    joined_at?: string;
    left_at?: string | null;
    notes?: string | null;
    photo_path?: string | null;
    updated_by?: string | null;
  }
): Promise<Member> {
  const ctx = await requireAuthenticated();

  // Authorization check – members.edit
  const hasEdit = checkPermission(ctx, PERMISSIONS.MEMBERS_EDIT) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_EDIT));

  if (!hasEdit) {
    throw createAuthError(403, "Nemáte oprávnenie na upravovanie člena.");
  }

  const supabase = await createClient();

  // Verify member exists
  const { data: existingMember, error: checkError } = await supabase
    .from("members")
    .select("id, member_number, first_name, last_name, membership_type, status")
    .eq("id", memberId)
    .single();

  if (checkError) {
    console.error("[updateMember] Supabase error checking member:", checkError);
    throw createAuthError(404, "Člen sa nenájde.");
  }

  if (!existingMember) {
    throw createAuthError(404, "Člen sa nenájde.");
  }

  // Server-side (authoritatívna) validácia enum hodnôt a formátov pred zápisom.
  if (data.membership_type !== undefined && !isMembershipType(data.membership_type)) {
    throw createAuthError(400, "Neplatná kategória člena.");
  }
  if (data.status !== undefined && !isMemberStatus(data.status)) {
    throw createAuthError(400, "Neplatný stav člena.");
  }
  if (data.email !== undefined && !isValidEmail(data.email)) {
    throw createAuthError(400, "Email nemá platný formát.");
  }
  if (data.phone !== undefined && !isValidPhone(data.phone)) {
    throw createAuthError(400, "Telefón nemá platný formát.");
  }

  // Build update object - only include provided fields
  type MemberUpdate = Partial<Member>;
  const updateData: MemberUpdate = {};
  
  if (data.first_name !== undefined) updateData.first_name = data.first_name;
  if (data.last_name !== undefined) updateData.last_name = data.last_name;
  if (data.title !== undefined) updateData.title = data.title;
  if (data.rank !== undefined) updateData.rank = data.rank;
  if (data.position !== undefined) updateData.position = data.position;
  if (data.is_committee_member !== undefined) updateData.is_committee_member = data.is_committee_member;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.birth_date !== undefined) updateData.birth_date = data.birth_date;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.membership_type !== undefined) updateData.membership_type = data.membership_type;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.joined_at !== undefined) updateData.joined_at = data.joined_at;
  if (data.left_at !== undefined) updateData.left_at = data.left_at;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.photo_path !== undefined) updateData.photo_path = data.photo_path;
  
  updateData.updated_by = data.updated_by ?? ctx.userId;
  updateData.updated_at = new Date().toISOString();

  const { data: rawMember, error } = await supabase
    .from("members")
    .update(updateData as never)
    .eq("id", memberId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateMember] Supabase error:", error);
    if (error.code === "PGRST306") {
      throw createAuthError(404, "Člen sa nenájde.");
    }
    const dbMsg = error.message ?? "";
    throw createAuthError(500, `Chyba pri ukladaní zmeny: ${dbMsg}`);
  }

  const member = rawMember as Member;

  // Audit
  await auditMemberUpdate(ctx.userId, memberId, {
    member_number: member.member_number,
    first_name: member.first_name,
    last_name: member.last_name,
    membership_type: member.membership_type,
    status: member.status,
  });

  return member;
}

/**
 * archiveMember – Archiváciu člena (status INACTIVE, left_at nastavené).
 * DOPLNI "EDIT" (archive je podmnožina edit)
 */
export async function archiveMember(memberId: string): Promise<Member> {
  const ctx = await requireAuthenticated();

  // Authorization check – members.edit
  const hasEdit = checkPermission(ctx, PERMISSIONS.MEMBERS_EDIT) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_EDIT));

  if (!hasEdit) {
    throw createAuthError(403, "Nemáte oprávnenie na archivovanie člena.");
  }

  const supabase = await createClient();

  // overime existenciu člena
  const { data: existingRaw, error: existError } = await supabase
    .from("members")
    .select("id, status")
    .eq("id", memberId)
    .single();

  if (existError) {
    console.error("[archiveMember] Supabase error:", existError);
    throw createAuthError(404, "Člen sa nenájde.");
  }

  const existingMember = existingRaw as { id: string; status: string } | null;
  if (!existingMember) {
    throw createAuthError(404, "Člen sa nenájde.");
  }

  // overime status – nie je to hard delete
  if (existingMember.status === "inactive") {
    // už archivovaný – môžeme vrátiť existujúci stav alebo 409
    throw createAuthError(409, "Člen už je archivovaný.");
  }

  const { data: rawData, error } = await supabase
    .from("members")
    .update({
      status: "inactive",
      left_at: new Date().toISOString(),
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", memberId)
    .select("*")
    .single();

  if (error) {
    console.error("[archiveMember] Supabase error:", error);
    throw createAuthError(500, "Chyba pri archivovaní člena.");
  }

  const member = rawData as Member;

  // Audit
  await auditMemberArchive(ctx.userId, memberId);

  return member;
}

/**
 * reactivateMember – Reaktivácia člena (status ACTIVE, left_at vynulované).
 * Vyžaduje `members.edit`. Nie je to hard delete.
 */
export async function reactivateMember(memberId: string): Promise<Member> {
  const ctx = await requireAuthenticated();

  // Authorization check – members.edit
  const hasEdit = checkPermission(ctx, PERMISSIONS.MEMBERS_EDIT) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_EDIT));

  if (!hasEdit) {
    throw createAuthError(403, "Nemáte oprávnenie na reaktiváciu člena.");
  }

  const supabase = await createClient();

  const { data: existingRaw, error: existError } = await supabase
    .from("members")
    .select("id, status")
    .eq("id", memberId)
    .single();

  if (existError) {
    throw createAuthError(404, "Člen sa nenájde.");
  }

  const existingMember = existingRaw as { id: string; status: string } | null;
  if (!existingMember) {
    throw createAuthError(404, "Člen sa nenájde.");
  }

  if (existingMember.status === "active") {
    throw createAuthError(409, "Člen už je aktívny.");
  }

  const { data: rawData, error } = await supabase
    .from("members")
    .update({
      status: "active",
      left_at: null,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", memberId)
    .select("*")
    .single();

  if (error) {
    console.error("[reactivateMember] Supabase error:", error);
    throw createAuthError(500, "Chyba pri reaktivácii člena.");
  }

  const member = rawData as Member;

  // Audit
  await auditMemberUpdate(ctx.userId, memberId, { status: { from: "inactive", to: "active" } });

  return member;
}

/**
 * deleteMember – trvalé vymazanie člena (hard delete).
 * Vyžaduje `members.delete`.
 * Väzby CASCADE odstránia súvisiace záznamy (kurzy, licencie, dokumenty,
 * priradenia výstroja, dochádzku). RLS `members_delete_admin` vyžaduje
 * rolu ADMIN – ak volajúci rolu nemá, databáza vráti 403.
 */
export async function deleteMember(memberId: string): Promise<{ id: string }> {
  const ctx = await requireAuthenticated();

  const hasDelete =
    checkPermission(ctx, PERMISSIONS.MEMBERS_DELETE) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_DELETE));

  if (!hasDelete) {
    throw createAuthError(403, "Nemáte oprávnenie na vymazanie člena.");
  }

  const supabase = await createClient();

  // overenie existencie člena
  const { data: existingRaw, error: existError } = await supabase
    .from("members")
    .select("id, first_name, last_name, member_number")
    .eq("id", memberId)
    .single();

  if (existError) {
    console.error("[deleteMember] Supabase error:", existError);
    throw createAuthError(404, "Člen sa nenájde.");
  }

  const existingMember = existingRaw as {
    id: string;
    first_name: string;
    last_name: string;
    member_number: string;
  } | null;
  if (!existingMember) {
    throw createAuthError(404, "Člen sa nenájde.");
  }

  const { error } = await supabase.from("members").delete().eq("id", memberId);

  if (error) {
    console.error("[deleteMember] Supabase error:", error);
    throw createAuthError(500, "Chyba pri vymazávaní člena.");
  }

  // Audit – záznam zostáva aj po odstránení člena
  await logSecurityEvent({
    userId: ctx.userId,
    module: AUDIT_MODULES.MEMBERS,
    action: AUDIT_ACTIONS.DELETE,
    objectId: memberId,
    data: {
      member_number: existingMember.member_number,
      first_name: existingMember.first_name,
      last_name: existingMember.last_name,
    },
  });

  return { id: memberId };
}

/**
 * getMemberPreview – Pixel-limited view (tým, čo je v getMember) s odstránením citlivých údajov
 * Toto nie je oddelená fungovanie – používa sa len pre reading, nepre export.
 */
export async function getMemberPreview(
  memberId: string
): Promise<Omit<Member, "phone" | "email" | "birth_date" | "address">> {
  const member = await getMember(memberId);
  return {
    id: member.id,
    member_number: member.member_number,
    first_name: member.first_name,
    last_name: member.last_name,
    title: member.title,
    rank: member.rank,
    position: member.position,
    is_committee_member: member.is_committee_member,
    membership_type: member.membership_type,
    status: member.status,
    joined_at: member.joined_at,
    left_at: member.left_at,
    notes: member.notes,
    created_at: member.created_at,
    updated_at: member.updated_at,
    created_by: member.created_by,
    updated_by: member.updated_by,
    auth_user_id: member.auth_user_id,
    photo_path: member.photo_path,
  };
}

/**
 * getMemberById – alias pre `getMember`, vyžadovaný K8.4 detail stránkou.
 * Vyžaduje `members.view`.
 */
export async function getMemberById(memberId: string): Promise<Member> {
  return getMember(memberId);
}

// =============================================================================
// GUARDIANS (member_guardians)
// =============================================================================

/**
 * listMemberGuardians – zoznam zákonných zástupcov člena.
 * Vyžaduje `members.view`.
 */
export async function listMemberGuardians(memberId: string): Promise<MemberGuardian[]> {
  const ctx = await requireAuthenticated();

  const hasView =
    checkPermission(ctx, PERMISSIONS.MEMBERS_VIEW) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_VIEW));

  if (!hasView) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie zástupcov.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("member_guardians")
    .select("*")
    .eq("member_id", memberId)
    .order("is_primary_contact", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[listMemberGuardians] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní zástupcov.");
  }

  return (data || []) as MemberGuardian[];
}

/**
 * createMemberGuardian – vytvorenie zástupcu člena.
 * Vyžaduje `members.edit`.
 */
export async function createMemberGuardian(
  memberId: string,
  data: {
    relationship: string;
    is_primary_contact?: boolean;
    phone?: string | null;
    email?: string | null;
    user_id?: string | null;
    guardian_full_name: string;
  }
): Promise<MemberGuardian> {
  const ctx = await requireAuthenticated();

  const hasEdit =
    checkPermission(ctx, PERMISSIONS.MEMBERS_EDIT) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_EDIT));

  if (!hasEdit) {
    throw createAuthError(403, "Nemáte oprávnenie na správu zástupcov.");
  }

  if (!data.relationship || data.relationship.trim().length === 0) {
    throw createAuthError(400, "Vzťah je povinný.");
  }
  if (!data.guardian_full_name || data.guardian_full_name.trim().length === 0) {
    throw createAuthError(400, "Meno zástupcu je povinné.");
  }
  const phone = (data.phone ?? "").trim();
  if (phone.length === 0) {
    throw createAuthError(400, "Telefón zástupcu je povinný.");
  }
  if (data.email !== undefined && !isValidEmail(data.email)) {
    throw createAuthError(400, "Email zástupcu nemá platný formát.");
  }

  const fullName = data.guardian_full_name.trim();

  const supabase = await createClient();

  // Ochrana pred duplicitnými väzbami: ak už pre člena existuje zástupca
  // s rovnakým normalizovaným menom, NEVYTVÁRA nový záznam – vracia existujúci
  // (idempotentný zápis). Chráni opakované submity aj preklepy typu "Jana/Mária".
  const { data: existingGuardians, error: listError } = await supabase
    .from("member_guardians")
    .select("id, guardian_full_name")
    .eq("member_id", memberId);

  if (listError) {
    console.error("[createMemberGuardian] List error:", listError);
    throw createAuthError(500, "Chyba pri overovaní zástupcov.");
  }

  // `Database` typy ešte neobsahujú member_guardians (známy schema drift) –
  // výsledok dotazu je `never[]`; explicitný cast zachová typovú bezpečnosť.
  const remainingRows = (existingGuardians ?? []) as {
    id: string;
    guardian_full_name: string;
  }[];
  const duplicate = remainingRows.length
    ? findDuplicateGuardian(remainingRows, fullName)
    : null;

  if (duplicate) {
    const { data: dupRaw, error: dupError } = await supabase
      .from("member_guardians")
      .select("*")
      .eq("id", duplicate.id)
      .single();
    if (dupError) {
      console.error("[createMemberGuardian] Duplicate fetch error:", dupError);
      throw createAuthError(500, "Chyba pri načítaní existujúceho zástupcu.");
    }
    return dupRaw as MemberGuardian;
  }

  const { data: rawGuardian, error } = await supabase
    .from("member_guardians")
    .insert({
      member_id: memberId,
      user_id: data.user_id ?? null,
      relationship: data.relationship.trim(),
      guardian_full_name: fullName,
      is_primary_contact: data.is_primary_contact ?? false,
      phone,
      email: (data.email ?? "").trim() || null,
      created_by: ctx.userId,
    } as never)
    .select("*")
    .single();

  if (error) {
    console.error("[createMemberGuardian] Supabase error:", error);
    throw createAuthError(500, "Chyba pri ukladaní zástupcu.");
  }

  return rawGuardian as MemberGuardian;
}

/**
 * updateMemberGuardian – úprava zástupcu člena.
 * Vyžaduje `members.edit`. Overuje IDOR (guardian musí patriť danému memberId).
 */
export async function updateMemberGuardian(
  memberId: string,
  guardianId: string,
  data: {
    relationship?: string;
    is_primary_contact?: boolean;
    phone?: string | null;
    email?: string | null;
    guardian_full_name?: string;
  }
): Promise<MemberGuardian> {
  const ctx = await requireAuthenticated();

  const hasEdit =
    checkPermission(ctx, PERMISSIONS.MEMBERS_EDIT) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_EDIT));

  if (!hasEdit) {
    throw createAuthError(403, "Nemáte oprávnenie na správu zástupcov.");
  }

  if (
    data.guardian_full_name !== undefined &&
    data.guardian_full_name.trim().length === 0
  ) {
    throw createAuthError(400, "Meno zástupcu je povinné.");
  }
  if (
    data.relationship !== undefined &&
    data.relationship.trim().length === 0
  ) {
    throw createAuthError(400, "Vzťah je povinný.");
  }
  if (data.phone !== undefined) {
    const phone = (data.phone ?? "").trim();
    if (phone.length === 0) {
      throw createAuthError(400, "Telefón zástupcu je povinný.");
    }
    if (!isValidPhone(phone)) {
      throw createAuthError(400, "Telefón zástupcu nemá platný formát.");
    }
  }
  if (data.email !== undefined && !isValidEmail(data.email)) {
    throw createAuthError(400, "Email zástupcu nemá platný formát.");
  }

  const supabase = await createClient();

  const updatePayload: {
    relationship?: string;
    is_primary_contact?: boolean;
    phone?: string | null;
    email?: string | null;
    guardian_full_name?: string;
  } = {};
  if (data.relationship !== undefined) updatePayload.relationship = data.relationship.trim();
  if (data.is_primary_contact !== undefined) updatePayload.is_primary_contact = data.is_primary_contact;
  if (data.phone !== undefined) updatePayload.phone = (data.phone ?? "").trim();
  if (data.email !== undefined) updatePayload.email = (data.email ?? "").trim() || null;
  if (data.guardian_full_name !== undefined) {
    updatePayload.guardian_full_name = data.guardian_full_name.trim();
  }

  const { data: rawGuardian, error } = await supabase
    .from("member_guardians")
    .update(updatePayload as never)
    .eq("id", guardianId)
    .eq("member_id", memberId)
    .select("*")
    .single();

  if (error) {
    console.error("[updateMemberGuardian] Supabase error:", error);
    throw createAuthError(404, "Zástupca sa nenašiel.");
  }

  return rawGuardian as MemberGuardian;
}

/**
 * deleteMemberGuardian – odstránenie zástupcu člena.
 * Vyžaduje `members.edit`. Overuje IDOR (guardian musí patriť danému memberId).
 */
export async function deleteMemberGuardian(memberId: string, guardianId: string): Promise<void> {
  const ctx = await requireAuthenticated();

  const hasEdit =
    checkPermission(ctx, PERMISSIONS.MEMBERS_EDIT) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_EDIT));

  if (!hasEdit) {
    throw createAuthError(403, "Nemáte oprávnenie na správu zástupcov.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("member_guardians")
    .delete()
    .eq("id", guardianId)
    .eq("member_id", memberId);

  if (error) {
    console.error("[deleteMemberGuardian] Supabase error:", error);
    throw createAuthError(500, "Chyba pri odstraňovaní zástupcu.");
  }
}

// =============================================================================
// PHOTO (private bucket `member-photos`, podpisované URL)
// =============================================================================

const MEMBER_PHOTO_BUCKET = "member-photos";

/**
 * getMemberPhotoUrl – časovo obmedzená Signed URL fotografie člena.
 * Vyžaduje `members.view`. Nevracia verejnú URL.
 */
export async function getMemberPhotoUrl(photoPath: string | null): Promise<string | null> {
  if (!photoPath) return null;

  const ctx = await requireAuthenticated();

  const hasView =
    checkPermission(ctx, PERMISSIONS.MEMBERS_VIEW) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_VIEW));

  if (!hasView) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie fotografie.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from(MEMBER_PHOTO_BUCKET)
    .createSignedUrl(photoPath, 60 * 10);

  if (error || !data?.signedUrl) {
    console.error("[getMemberPhotoUrl] Storage error:", error);
    return null;
  }

  return data.signedUrl;
}


// =============================================================================
// TEST FIXTURES (K8.2)
// =============================================================================

// Test fixtures for authorization testing
export const AUTH_FIXTURES = {
  unauthenticated: null as unknown,
  member: {
    userId: "test-member",
    email: "test@dhz.sk",
    roles: ["CLEN"],
    permissions: [PERMISSIONS.MEMBERS_VIEW],
  },
  trainer: {
    userId: "test-trainer",
    email: "trainer@dhz.sk",
    roles: ["TRENER"],
    permissions: [PERMISSIONS.MEMBERS_VIEW],
  },
  clerk: {
    userId: "test-clerk",
    email: "clerk@dhz.sk",
    roles: ["POKLADNIK"],
    permissions: [PERMISSIONS.MEMBERS_VIEW],
  },
  dietician: {
    userId: "test-dietician",
    email: "dietician@dhz.sk",
    roles: ["RODIC"],
    permissions: [PERMISSIONS.MEMBERS_VIEW],
  },
  velitel: {
    userId: "test-velitel",
    email: "velitel@dhz.sk",
    roles: ["VELITEL"],
    permissions: [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.MEMBERS_CREATE, PERMISSIONS.MEMBERS_EDIT],
  },
  vedenie: {
    userId: "test-vedenie",
    email: "vedenie@dhz.sk",
    roles: ["VEDENIE"],
    permissions: [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.MEMBERS_CREATE, PERMISSIONS.MEMBERS_EDIT],
  },
  admin: {
    userId: "test-admin",
    email: "admin@dhz.sk",
    roles: ["ADMIN"],
    permissions: [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.MEMBERS_CREATE, PERMISSIONS.MEMBERS_EDIT, PERMISSIONS.ADMIN_USERS],
  },
} as const;

export { AuthError, createAuthError } from "./members.errors";
