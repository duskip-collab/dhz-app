// Member validation – ručná validácia bez externých závislostí
// K8.4 – Member Detail, Form, Guardian Management & Photo Upload
//
// Okrem validácie obsahuje čisté (pure) mapovacie a dedup funkcie používané
// server-actions aj service vrstvou. Všetky sú unit-testované cez node --test
// bez databázy.

import type {
  Member,
  MembershipType,
  MemberStatus,
  MemberGuardian,
} from "@/lib/members/members.service";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

export interface CreateMemberInput {
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
}

export interface UpdateMemberInput {
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
}

export interface GuardianInput {
  full_name: string;
  phone: string;
  email?: string | null;
  relationship: string;
  is_primary_contact?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s/.-]{5,}$/;

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

function isValidDate(value: string): boolean {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

export function validateMemberBase(input: {
  member_number?: string;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  joined_at?: string;
  rank?: string | null;
  position?: string | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  if (input.member_number !== undefined && isBlank(input.member_number)) {
    errors.member_number = "Registračné číslo je povinné.";
  }
  if (input.first_name !== undefined && isBlank(input.first_name)) {
    errors.first_name = "Meno je povinné.";
  }
  if (input.last_name !== undefined && isBlank(input.last_name)) {
    errors.last_name = "Priezvisko je povinné.";
  }

  const email = trimOrNull(input.email ?? null);
  if (email !== null && !EMAIL_RE.test(email)) {
    errors.email = "Email nemá platný formát.";
  }

  const phone = trimOrNull(input.phone ?? null);
  if (phone !== null && !PHONE_RE.test(phone)) {
    errors.phone = "Telefón nemá platný formát.";
  }

  const birth = trimOrNull(input.birth_date ?? null);
  if (birth !== null) {
    if (!isValidDate(birth)) {
      errors.birth_date = "Dátum narodenia nie je platný dátum.";
    } else if (new Date(birth).getTime() > Date.now()) {
      errors.birth_date = "Dátum narodenia nemôže byť v budúcnosti.";
    }
  }

  const joined = trimOrNull(input.joined_at ?? null);
  if (joined !== null && joined !== undefined && !isValidDate(joined)) {
    errors.joined_at = "Dátum vstupu nie je platný dátum.";
  }

  const rank = trimOrNull(input.rank ?? null);
  if (rank !== null && rank.length > MAX_ROLE_LENGTH) {
    errors.rank = `Hodnosť je príliš dlhá (max ${MAX_ROLE_LENGTH} znakov).`;
  }

  const position = trimOrNull(input.position ?? null);
  if (position !== null && position.length > MAX_ROLE_LENGTH) {
    errors.position = `Zaradenie je príliš dlhé (max ${MAX_ROLE_LENGTH} znakov).`;
  }

  return errors;
}

/** Maximálna dĺžka hodnosti / funkčného zaradenia (znaky). */
const MAX_ROLE_LENGTH = 100;

export function validateCreateMember(
  input: CreateMemberInput
): ValidationResult<CreateMemberInput> {
  const errors = validateMemberBase(input);
  if (isBlank(input.member_number)) errors.member_number = "Registračné číslo je povinné.";
  if (isBlank(input.first_name)) errors.first_name = "Meno je povinné.";
  if (isBlank(input.last_name)) errors.last_name = "Priezvisko je povinné.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: input };
}

export function validateUpdateMember(
  input: UpdateMemberInput
): ValidationResult<UpdateMemberInput> {
  const errors = validateMemberBase({
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    phone: input.phone,
    birth_date: input.birth_date,
    joined_at: input.joined_at,
  });
  if (input.first_name !== undefined && isBlank(input.first_name)) {
    errors.first_name = "Meno nesmie byť prázdne.";
  }
  if (input.last_name !== undefined && isBlank(input.last_name)) {
    errors.last_name = "Priezvisko nesmie byť prázdne.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: input };
}

export function validateGuardian(input: GuardianInput): ValidationResult<GuardianInput> {
  const errors: Record<string, string> = {};
  if (isBlank(input.full_name)) errors.guardian_name = "Meno zástupcu je povinné.";
  const phone = trimOrNull(input.phone);
  if (phone === null) {
    errors.guardian_phone = "Telefón zástupcu je povinný.";
  } else if (!PHONE_RE.test(phone)) {
    errors.guardian_phone = "Telefón zástupcu nemá platný formát.";
  }
  if (isBlank(input.relationship)) errors.guardian_relationship = "Vzťah je povinný.";
  const email = trimOrNull(input.email ?? null);
  if (email !== null && !EMAIL_RE.test(email)) {
    errors.guardian_email = "Email zástupcu nemá platný formát.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: input };
}

// =============================================================================
// ENUM GUARDS (server-side authoritative checks)
// =============================================================================

const MEMBERSHIP_TYPES: readonly MembershipType[] = [
  "adult",
  "youth",
  "preparatory",
  "dorast",
];
const MEMBER_STATUSES: readonly MemberStatus[] = ["active", "inactive"];

export function isMembershipType(value: unknown): value is MembershipType {
  return (
    typeof value === "string" &&
    (MEMBERSHIP_TYPES as readonly string[]).includes(value)
  );
}

export function isMemberStatus(value: unknown): value is MemberStatus {
  return (
    typeof value === "string" &&
    (MEMBER_STATUSES as readonly string[]).includes(value)
  );
}

/** Či je daný typ členstva mládežnícky (vyžaduje / zobrazuje zástupcu). */
export function isYouthCategory(t: MembershipType | undefined): boolean {
  return t === "youth" || t === "preparatory" || t === "dorast";
}

/** Alias pre dynamické zobrazenie sekcie zákonného zástupcu. */
export function requiresGuardian(t: MembershipType | undefined): boolean {
  return isYouthCategory(t);
}

/** Exportovaná kontrola e-mailu pre server-side (service) validáciu. */
export function isValidEmail(value: string | null | undefined): boolean {
  const email = trimOrNull(value ?? null);
  return email === null || EMAIL_RE.test(email);
}

/** Exportovaná kontrola telefónu pre server-side (service) validáciu. */
export function isValidPhone(value: string | null | undefined): boolean {
  const phone = trimOrNull(value ?? null);
  return phone === null || PHONE_RE.test(phone);
}

// =============================================================================
// FORM <-> MODEL MAPOVANIE (pure, unit-testované)
// =============================================================================

/** Hodnoty formulára člena – defaulty aj persistentné polia. */
export interface MemberFormValues {
  member_number: string;
  first_name: string;
  last_name: string;
  title: string;
  rank: string;
  position: string;
  is_committee_member: boolean;
  phone: string;
  email: string;
  birth_date: string;
  address: string;
  membership_type: MembershipType;
  status: MemberStatus;
  joined_at: string;
  notes: string;
}

/** Row z FormData (po field() helperi – reťazec alebo null). */
export interface RawMemberFormFields {
  member_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  rank?: string | null;
  position?: string | null;
  is_committee_member?: boolean;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  address?: string | null;
  membership_type?: string | null;
  status?: string | null;
  joined_at?: string | null;
  notes?: string | null;
}

/** Prenesie existujúceho člena do formulárových defaultov (predvyplnenie pri úprave). */
export function memberToFormValues(member: Member): MemberFormValues {
  return {
    member_number: member.member_number,
    first_name: member.first_name,
    last_name: member.last_name,
    title: member.title ?? "",
    rank: member.rank ?? "",
    position: member.position ?? "",
    is_committee_member: member.is_committee_member,
    phone: member.phone ?? "",
    email: member.email ?? "",
    birth_date: member.birth_date ? member.birth_date.slice(0, 10) : "",
    address: member.address ?? "",
    membership_type: member.membership_type,
    status: member.status,
    joined_at: member.joined_at ? member.joined_at.slice(0, 10) : "",
    notes: member.notes ?? "",
  };
}

/** Zostaví create payload z FormData hodnôt. Defaulty: adult/active, joined_at = now. */
export function createMemberInputFromForm(
  raw: RawMemberFormFields
): CreateMemberInput {
  return {
    member_number: raw.member_number ?? "",
    first_name: raw.first_name ?? "",
    last_name: raw.last_name ?? "",
    title: raw.title ?? null,
    rank: raw.rank ?? null,
    position: raw.position ?? null,
    is_committee_member: raw.is_committee_member ?? false,
    phone: raw.phone ?? null,
    email: raw.email ?? null,
    birth_date: raw.birth_date ?? null,
    address: raw.address ?? null,
    membership_type: isMembershipType(raw.membership_type)
      ? raw.membership_type
      : "adult",
    status: isMemberStatus(raw.status) ? raw.status : "active",
    joined_at: raw.joined_at ?? new Date().toISOString(),
    notes: raw.notes ?? null,
  };
}
/**
 * Zostaví update payload z FormData hodnôt.
 * Polia, ktoré neboli odoslané (undefined), sa NEdotýkajú – updateMember
 * v service vrstve zapisuje iba prítomné polia => žiadna strata údajov.
 * Prázdny reťazec (null) = vymazanie voliteľného poľa (zachované správanie).
 */
export function updateMemberInputFromForm(
  raw: RawMemberFormFields
): UpdateMemberInput {
  const result: UpdateMemberInput = {};
  if (raw.first_name !== undefined) result.first_name = raw.first_name ?? "";
  if (raw.last_name !== undefined) result.last_name = raw.last_name ?? "";
  if (raw.title !== undefined) result.title = raw.title ?? null;
  if (raw.rank !== undefined) result.rank = raw.rank ?? null;
  if (raw.position !== undefined) result.position = raw.position ?? null;
  if (raw.is_committee_member !== undefined) {
    result.is_committee_member = raw.is_committee_member;
  }
  if (raw.phone !== undefined) result.phone = raw.phone ?? null;
  if (raw.email !== undefined) result.email = raw.email ?? null;
  if (raw.birth_date !== undefined) result.birth_date = raw.birth_date ?? null;
  if (raw.address !== undefined) result.address = raw.address ?? null;
  if (raw.membership_type !== undefined && isMembershipType(raw.membership_type)) {
    result.membership_type = raw.membership_type;
  }
  if (raw.status !== undefined && isMemberStatus(raw.status)) {
    result.status = raw.status;
  }
  if (raw.joined_at !== undefined) result.joined_at = raw.joined_at ?? undefined;
  if (raw.notes !== undefined) result.notes = raw.notes ?? null;
  return result;
}

/** Row z FormData zástupcu. */
export interface RawGuardianFormFields {
  guardian_name?: string | null;
  guardian_relationship?: string | null;
  guardian_phone?: string | null;
  guardian_email?: string | null;
}

/**
 * Zostaví guardian input z FormData hodnôt.
 * Vracia null, ak nie sú vyplnené žiadne zásadné polia (prázdny formulár).
 */
export function guardianInputFromForm(
  raw: RawGuardianFormFields
): GuardianInput | null {
  const name = (raw.guardian_name ?? "").trim();
  const phone = (raw.guardian_phone ?? "").trim();
  const relationship = (raw.guardian_relationship ?? "").trim();
  const email = (raw.guardian_email ?? "").trim();
  if (!name && !phone && !relationship && !email) return null;
  return {
    full_name: name,
    phone,
    email: raw.guardian_email,
    relationship,
    is_primary_contact: true,
  };
}

// =============================================================================
// DUPLICITNÉ VÄZBY ZÁSTUPCOV (pure)
// =============================================================================

/** Normalizované meno pre dedup porovnanie (case-insensitive, bez okrajových medzier). */
export function normalizeGuardianName(name: string): string {
  return name.trim().toLocaleLowerCase("sk-SK");
}

/**
 * Nájde existujúceho zástupcu s rovnakým normalizovaným menom.
 * `ignoreId` vylúči aktuálny záznam (pri úprave). Vracia zhodu alebo null.
 */
export function findDuplicateGuardian<
  T extends { id: string; guardian_full_name: string },
>(
  existing: readonly T[],
  fullName: string,
  ignoreId?: string
): T | null {
  const key = normalizeGuardianName(fullName);
  return (
    existing.find(
      (g) =>
        g.id !== ignoreId &&
        normalizeGuardianName(g.guardian_full_name) === key
    ) ?? null
  );
}

export function normalizeGuardianForDb(
  memberId: string,
  input: GuardianInput,
  userId: string | null
): {
  member_id: string;
  relationship: string;
  is_primary_contact: boolean;
  phone: string | null;
  email: string | null;
  created_by: string | null;
  guardian_full_name: string;
} {
  return {
    member_id: memberId,
    relationship: input.relationship.trim(),
    is_primary_contact: input.is_primary_contact ?? true,
    phone: trimOrNull(input.phone),
    email: trimOrNull(input.email ?? null),
    created_by: userId,
    guardian_full_name: input.full_name.trim(),
  };
}

export type { MembershipType, MemberStatus, MemberGuardian };
