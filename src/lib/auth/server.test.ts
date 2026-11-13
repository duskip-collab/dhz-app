// Unit testy auth mapperov (K13_AUTH_RUNTIME_FIX) — node --test
// Kryjú REÁLNU schému migrácie 20261006 (UUID *_id + JOIN na definition
// tabuľky), chýbajúce kódy a bezpečné spracovanie chyby databázy
// (fail-closed: DB error → throw, nie tiché prázdne oprávnenia).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeEffectivePermissions,
  isActiveMemberAccessProfile,
  mapPermissionCodes,
} from "./permissions-map.ts";
import { getMemberAccessDenial } from "./access-policy.ts";
import { APP_ROLES } from "./roles.ts";
import { PERMISSIONS } from "./permissions.ts";

test("mapPermissionCodes: role aj priame riadky → platné kódy", () => {
  assert.deepEqual(
    mapPermissionCodes([
      { permissions: { code: "finance.view" } },
      { permissions: [{ code: "members.view" }] },
      { permissions: { code: "nie.opravnenie" } },
      { permissions: null },
    ]),
    ["finance.view", "members.view"],
  );
});

test("mapPermissionCodes: prázdny vstup → prázdne pole (bez chyby)", () => {
  assert.deepEqual(mapPermissionCodes([]), []);
});

test("inactive or missing access profile fails closed", () => {
  assert.equal(isActiveMemberAccessProfile("inactive"), false);
  assert.equal(isActiveMemberAccessProfile(undefined), false);
  assert.equal(isActiveMemberAccessProfile("active"), true);
});

test("effective permissions include role permissions and individual grants", () => {
  assert.deepEqual(
    computeEffectivePermissions(
      ["members.view", "finance.view"],
      ["documents.upload"],
      [],
    ),
    ["members.view", "finance.view", "documents.upload"],
  );
});

test("individual denials override role permissions and grants", () => {
  assert.deepEqual(
    computeEffectivePermissions(
      ["members.view", "finance.view"],
      ["members.edit", "finance.view"],
      ["finance.view", "members.edit"],
    ),
    ["members.view"],
  );
});

test("effective permissions deduplicate permissions shared by role and grant", () => {
  assert.deepEqual(
    computeEffectivePermissions(["members.view"], ["members.view"], []),
    ["members.view"],
  );
});

test("access policy rejects changing the caller's own member access", () => {
  assert.equal(
    getMemberAccessDenial({
      actorMemberId: "member-1",
      targetMemberId: "member-1",
      actorRoles: [APP_ROLES.ADMIN],
      actorPermissions: [],
      targetRole: APP_ROLES.CLEN,
    }),
    "self_target",
  );
});

test("access policy forbids ADMIN assignment by a non-ADMIN user manager", () => {
  assert.equal(
    getMemberAccessDenial({
      actorMemberId: "member-1",
      targetMemberId: "member-2",
      actorRoles: [APP_ROLES.VEDENIE],
      actorPermissions: [PERMISSIONS.ADMIN_USERS],
      targetRole: APP_ROLES.ADMIN,
    }),
    "admin_role_restricted",
  );
});

test("access policy rejects managing another member without admin.users", () => {
  assert.equal(
    getMemberAccessDenial({
      actorMemberId: "member-1",
      targetMemberId: "member-2",
      actorRoles: [APP_ROLES.CLEN],
      actorPermissions: [],
      targetRole: APP_ROLES.CLEN,
    }),
    "forbidden",
  );
});
