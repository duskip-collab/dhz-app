// Unit testy K8.4 – Member Create & Edit Form – čistá validácia a mapovanie.
// Spustenie: node --test src/features/members/schemas/member.validation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMemberInputFromForm,
  findDuplicateGuardian,
  guardianInputFromForm,
  isMembershipType,
  isMemberStatus,
  isYouthCategory,
  isValidEmail,
  isValidPhone,
  memberToFormValues,
  normalizeGuardianName,
  requiresGuardian,
  updateMemberInputFromForm,
  validateCreateMember,
  validateGuardian,
  validateUpdateMember,
} from "./member.validation.ts";

const validAdultRaw = {
  member_number: "DHZ-001",
  first_name: "Ján",
  last_name: "Mrkvička",
  title: null,
  phone: "+421 911 111 111",
  email: "jan@example.sk",
  birth_date: "1990-05-01",
  address: "Hlavná 1, 010 01 Žilina",
  membership_type: "adult",
  status: "active",
  joined_at: "2020-01-15",
  notes: null,
};

const memberFixture = {
  id: "member-1",
  auth_user_id: null,
  member_number: "DHZ-001",
  first_name: "Ján",
  last_name: "Mrkvička",
  title: "Ing.",
  phone: "+421 911 111 111",
  email: "jan@example.sk",
  birth_date: "1990-05-01",
  address: "Hlavná 1",
  membership_type: "youth" as const,
  status: "active" as const,
  joined_at: "2020-01-15",
  left_at: null,
  notes: "poznámka",
  photo_path: null,
  created_at: "2020-01-15T00:00:00Z",
  updated_at: "2020-01-15T00:00:00Z",
  created_by: null,
  updated_by: null,
};

// ---------------------------------------------------------------------------
// 1. Validný vstup pre dospelého člena
// ---------------------------------------------------------------------------
test("VALID: dospelý člen s kompletnými údajmi prejde validáciou", () => {
  const parsed = validateCreateMember(createMemberInputFromForm(validAdultRaw));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.membership_type, "adult");
    assert.equal(parsed.data.status, "active");
  }
});

// ---------------------------------------------------------------------------
// 2. Validný vstup pre prípravku / dorast / mládež
// ---------------------------------------------------------------------------
test("VALID: prípravka aj dorast majú mládežnícky typ", () => {
  for (const t of ["preparatory", "dorast", "youth"]) {
    const parsed = validateCreateMember(
      createMemberInputFromForm({ ...validAdultRaw, membership_type: t }),
    );
    assert.equal(parsed.ok, true, `${t} prejde validáciou`);
  }
  assert.deepEqual(
    (["adult", "youth", "preparatory", "dorast"] as const).map(requiresGuardian),
    [false, true, true, true],
  );
});
// ---------------------------------------------------------------------------
// 3. Neplatný dátum narodenia
// ---------------------------------------------------------------------------
test("NEVALID: budúci dátum narodenia je odmietnutý", () => {
  const future = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
  const parsed = validateCreateMember(
    createMemberInputFromForm({ ...validAdultRaw, birth_date: future }),
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.ok(parsed.errors.birth_date);
});

test("NEVALID: neexistujúci dátum narodenia je odmietnutý", () => {
  const parsed = validateCreateMember(
    createMemberInputFromForm({ ...validAdultRaw, birth_date: "nie-datum" }),
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.ok(parsed.errors.birth_date);
});

// ---------------------------------------------------------------------------
// 4. Chýbajúce povinné údaje
// ---------------------------------------------------------------------------
test("NEVALID: chýbajúce povinné údaje → chyby pri poliach", () => {
  const parsed = validateCreateMember(
    createMemberInputFromForm({
      member_number: null,
      first_name: null,
      last_name: null,
      membership_type: "adult",
      status: "active",
    }),
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.member_number);
    assert.ok(parsed.errors.first_name);
    assert.ok(parsed.errors.last_name);
  }
});

// ---------------------------------------------------------------------------
// 5. Neplatný e-mail
// ---------------------------------------------------------------------------
test("NEVALID: neplatný e-mail je odmietnutý", () => {
  const parsed = validateCreateMember(
    createMemberInputFromForm({ ...validAdultRaw, email: "not-an-email" }),
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.ok(parsed.errors.email);
});

// ---------------------------------------------------------------------------
// 6. Dynamické zobrazenie polí podľa typu člena (zástupca)
// ---------------------------------------------------------------------------
test("DYN: sekcia zástupcu sa zobrazí len pre mládež", () => {
  assert.equal(isYouthCategory("adult"), false);
  assert.equal(isYouthCategory("youth"), true);
  assert.equal(isYouthCategory("preparatory"), true);
  assert.equal(isYouthCategory("dorast"), true);
  assert.equal(requiresGuardian(undefined), false);
});
// ---------------------------------------------------------------------------
// 7. Predvyplnenie údajov pri úprave
// ---------------------------------------------------------------------------
test("EDIT: memberToFormValues prenesie existujúceho člena do formulárových hodnôt", () => {
  const values = memberToFormValues(memberFixture as never);
  assert.equal(values.first_name, "Ján");
  assert.equal(values.last_name, "Mrkvička");
  assert.equal(values.member_number, "DHZ-001");
  assert.equal(values.birth_date, "1990-05-01");
  assert.equal(values.membership_type, "youth");
  assert.equal(values.status, "active");
  assert.equal(values.title, "Ing.");
  assert.equal(values.notes, "poznámka");
});

// ---------------------------------------------------------------------------
// 8. Uloženie úpravy bez straty nepoužitých údajov
// ---------------------------------------------------------------------------
test("EDIT: updateMemberInputFromForm zapíše IBA odoslané polia (ostatné zostávajú)", () => {
  const payload = updateMemberInputFromForm({
    first_name: "Mária",
    last_name: null,
    title: null,
    membership_type: "adult",
  });
  assert.deepEqual(payload, {
    first_name: "Mária",
    last_name: "",
    title: null,
    membership_type: "adult",
  });
  assert.equal("email" in payload, false);
  assert.equal("phone" in payload, false);
  assert.equal("joined_at" in payload, false);
});

test("EDIT: updateMemberInputFromForm ignoruje neplatné enum hodnoty", () => {
  const payload = updateMemberInputFromForm({
    membership_type: "NEZNÁMY",
    status: "ARCHIVED",
    first_name: "Ján",
  });
  assert.equal("membership_type" in payload, false);
  assert.equal("status" in payload, false);
  assert.equal(payload.first_name, "Ján");
});

test("EDIT: validácia úpravy prejde bez straty polí", () => {
  const payload = updateMemberInputFromForm({
    first_name: "Ján",
    email: "jan@example.sk",
  });
  const parsed = validateUpdateMember(payload);
  assert.equal(parsed.ok, true);
});

// ---------------------------------------------------------------------------
// 9. Správne vytvorenie väzby zástupcu (formulár → guardian input)
// ---------------------------------------------------------------------------
test("GUARDIAN: guardianInputFromForm + validateGuardian vytvorí platný input", () => {
  const input = guardianInputFromForm({
    guardian_name: "Anna Mrkvičková",
    guardian_relationship: "matka",
    guardian_phone: "+421 911 222 333",
    guardian_email: "anna@example.sk",
  });
  assert.ok(input);
  const parsed = validateGuardian(input!);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.full_name, "Anna Mrkvičková");
    assert.equal(parsed.data.is_primary_contact, true);
  }
});

test("GUARDIAN: prázdny formulár zástupcu vracia null (žiadny záznam)", () => {
  assert.equal(guardianInputFromForm({}), null);
  assert.equal(
    guardianInputFromForm({ guardian_name: "   ", guardian_phone: "  " }),
    null,
  );
});

test("GUARDIAN: neplatný e-mail zástupcu je odmietnutý", () => {
  const input = guardianInputFromForm({
    guardian_name: "Anna",
    guardian_relationship: "matka",
    guardian_phone: "+421 911 222 333",
    guardian_email: "nepaltné",
  });
  const parsed = validateGuardian(input!);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.ok(parsed.errors.guardian_email);
});

// ---------------------------------------------------------------------------
// 10. Ochrana pred duplicitným vytvorením väzby
// ---------------------------------------------------------------------------
test("DUP: findDuplicateGuardian nájde zhodu po normalizácii mena", () => {
  const existing = [
    { id: "g1", guardian_full_name: "Anna Mrkvičková" },
    { id: "g2", guardian_full_name: "Peter Mrkvička" },
  ];
  const dup = findDuplicateGuardian(existing, "  anna mrkvičková  ");
  assert.equal(dup?.id, "g1");
  assert.equal(normalizeGuardianName("  ANNA MRKVIČKOVÁ "), "anna mrkvičková");
});

test("DUP: ignoreId vylúči aktuálny záznam (úprava nemeniace meno)", () => {
  const existing = [{ id: "g1", guardian_full_name: "Anna Mrkvičková" }];
  assert.equal(findDuplicateGuardian(existing, "Anna Mrkvičková", "g1"), null);
});

// ---------------------------------------------------------------------------
// 11. Enum guards
// ---------------------------------------------------------------------------
test("ENUM: isMembershipType / isMemberStatus akceptujú len kanonické hodnoty", () => {
  assert.equal(isMembershipType("adult"), true);
  assert.equal(isMembershipType("preparatory"), true);
  assert.equal(isMembershipType("ADULT"), false);
  assert.equal(isMembershipType(42), false);
  assert.equal(isMemberStatus("active"), true);
  assert.equal(isMemberStatus("ACTIVE"), false);
});

// ---------------------------------------------------------------------------
// 12. Email / phone formáty
// ---------------------------------------------------------------------------
test("FORMAT: isValidEmail / isValidPhone", () => {
  assert.equal(isValidEmail("jan@example.sk"), true);
  assert.equal(isValidEmail("jan@example"), false);
  assert.equal(isValidEmail(null), true);
  assert.equal(isValidPhone("+421 911 111 111"), true);
  assert.equal(isValidPhone("abc"), false);
  assert.equal(isValidPhone(null), true);
});