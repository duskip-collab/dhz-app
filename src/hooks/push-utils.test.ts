// Unit testy push utilít (K13.4.2) — node --test src/hooks/push-utils.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { base64UrlToUint8Array, parsePushPayload } from "./push-utils.ts";

test("base64UrlToUint8Array dekóduje VAPID-tvar (base64url, bez paddingu)", () => {
  // "AQID" (base64) = [1,2,3]; base64url bez paddingu
  const bytes = base64UrlToUint8Array("AQID");
  assert.deepEqual(Array.from(bytes), [1, 2, 3]);
  // Znamienka +/ sa v base64url zapisujú ako -/_
  const withSpecials = base64UrlToUint8Array("-_8"); // "+/8" → [251, 255]
  assert.deepEqual(Array.from(withSpecials), [251, 255]);
});

test("parsePushPayload: neplatný/prázdny vstup = bezpečný fallback", () => {
  for (const raw of [null, undefined, "", "nie je json", "42", "[1,2]"]) {
    const p = parsePushPayload(raw as string | null | undefined);
    assert.equal(p.title, "DHZ Digital OS");
    assert.equal(p.body, "");
    assert.equal(p.url, null);
    assert.equal(p.icon, null);
    assert.equal(p.tag, null);
  }
});

test("parsePushPayload: korektný payload sa prenesie", () => {
  const p = parsePushPayload(
    JSON.stringify({
      title: "Končí STK",
      body: "Vozidlo Toyota Hilux — STK končí o 14 dní.",
      url: "/vehicles/123",
      icon: "/icons/icon-192.png",
      tag: "stk-123",
    }),
  );
  assert.equal(p.title, "Končí STK");
  assert.equal(p.body, "Vozidlo Toyota Hilux — STK končí o 14 dní.");
  assert.equal(p.url, "/vehicles/123");
  assert.equal(p.icon, "/icons/icon-192.png");
  assert.equal(p.tag, "stk-123");
});

test("parsePushPayload: absolute URL a protocol-relative URL sa ODHODIA (open-redirect)", () => {
  for (const url of ["https://evil.example", "//evil.example/x", "javascript:alert(1)"]) {
    const p = parsePushPayload(JSON.stringify({ title: "T", url }));
    assert.equal(p.url, null, `url ${url} musí byť odhodený`);
  }
  // Relatívna cesta je OK
  assert.equal(
    parsePushPayload(JSON.stringify({ url: "/vehicles/1" })).url,
    "/vehicles/1",
  );
});

test("parsePushPayload: chýbajúce polia nahradí fallbackom, nie null chybou", () => {
  const p = parsePushPayload(JSON.stringify({ title: "Len titulok" }));
  assert.equal(p.title, "Len titulok");
  assert.equal(p.body, "");
  assert.equal(p.url, null);
  assert.equal(p.icon, null);
  assert.equal(p.tag, null);
});
