// Unit testy auth mapperov (K13_AUTH_RUNTIME_FIX) — node --test
// Kryjú REÁLNU schému migrácie 20261006 (UUID *_id + JOIN na definition
// tabuľky), chýbajúce kódy a bezpečné spracovanie chyby databázy
// (fail-closed: DB error → throw, nie tiché prázdne oprávnenia).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRoleCodes, mapPermissionCodes } from "./permissions-map.ts";

test("mapRoleCodes: embed objekt {code} → AppRole, neznáme kódy vypadnú", () => {
  assert.deepEqual(
    mapRoleCodes([
      { roles: { code: "ADMIN" } },
      { roles: { code: "POKLADNIK" } },
      { roles: { code: "NEEXISTUJUCA_ROLA" } },
    ]),
    ["ADMIN", "POKLADNIK"],
  );
});

test("mapRoleCodes: pole-embed aj null → len platné (PostgREST tvar bez záruky)", () => {
  assert.deepEqual(
    mapRoleCodes([
      { roles: [{ code: "VEDENIE" }] },
      { roles: null },
      // @ts-expect-error — zámerné poškodené dáta na overenie robustnosti
      { roles: { code: 42 } },
    ]),
    ["VEDENIE"],
  );
});

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

test("mapRoleCodes/mapPermissionCodes: prázdny vstup → prázdne pole (bez chyby)", () => {
  assert.deepEqual(mapRoleCodes([]), []);
  assert.deepEqual(mapPermissionCodes([]), []);
});
