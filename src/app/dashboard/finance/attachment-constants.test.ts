/**
 * K13.2.3 — UNIT / STATIC testy pre politiku príloh finančných transakcí.
 *
 * Spúšťané bez bundlera a bez DB cez built-in Node test runner:
 *   node --test src/app/dashboard/finance/attachment-constants.test.ts
 *
 * OZNAČENIE: `UNIT` (čisté funkcie, žiadne IO) a `STATIC` (invarianty politiky).
 * Žiadny test tu nesmie byť označený PASS, ak sa reálne nevykonal.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_ATTACHMENT_TYPES,
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  SIGNED_URL_TTL_SECONDS,
  assertPathBinding,
  attachmentPathTransactionId,
  buildAttachmentPath,
  detectAttachmentMime,
  displayFileName,
  fileExtension,
  isUuid,
  sanitizeFileName,
} from "./attachment-constants.ts";

const TX_A = "11111111-1111-1111-1111-111111111111";
const TX_B = "22222222-2222-2222-2222-222222222222";

/** Minimálne platné hlavičky pre magic-byte detekciu. */
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, // RIFF ....
  0x57, 0x45, 0x42, 0x50, // WEBP
]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // MZ
const HTML = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>");

// ---------------------------------------------------------------------------
// STATIC — politika zodpovedá migráciam
// ---------------------------------------------------------------------------

test("STATIC: bucket / limity / TTL zodpovedajú migráciam 20261016 + 20261017", () => {
  assert.equal(ATTACHMENT_BUCKET, "finance_documents");
  assert.equal(MAX_ATTACHMENT_BYTES, 10485760); // storage.buckets.file_size_limit
  assert.equal(SIGNED_URL_TTL_SECONDS, 300); // požadovaná platnosť signed URL
});

test("STATIC: allow-list MIME typov zodpovedá storage.buckets.allowed_mime_types", () => {
  assert.deepEqual([...ALLOWED_ATTACHMENT_TYPES].sort(), [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
});

test("STATIC: neexistuje žiadny nebezpečný typ (svg/html/zip/exe)", () => {
  for (const bad of [
    "image/svg+xml",
    "text/html",
    "application/zip",
    "application/x-msdownload",
    "text/plain",
  ]) {
    assert.equal(ALLOWED_ATTACHMENT_TYPES.has(bad), false, bad);
  }
});

// ---------------------------------------------------------------------------
// UNIT — isUuid
// ---------------------------------------------------------------------------

test("UNIT isUuid: platné UUID prejde", () => {
  assert.equal(isUuid(TX_A), true);
  assert.equal(isUuid("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"), true);
});

test("UNIT isUuid: odmietne ne-UUID vstupy (path traversal, SQL, prázdne)", () => {
  for (const bad of [
    "",
    "not-a-uuid",
    "../../etc/passwd",
    "11111111-1111-1111-1111-11111111111", // 11 namiesto 12
    "11111111-1111-1111-1111-1111111111111", // 13
    "11111111-1111-1111-1111-11111111111g",
    "'; DROP TABLE finance_transactions; --",
    "11111111111111111111111111111111",
  ]) {
    assert.equal(isUuid(bad), false, JSON.stringify(bad));
  }
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(undefined), false);
  assert.equal(isUuid(42), false);
  assert.equal(isUuid({}), false);
});

// ---------------------------------------------------------------------------
// UNIT — detekcia MIME podľa magic bytes
// ---------------------------------------------------------------------------

test("UNIT detectAttachmentMime: rozpozná PDF/PNG/JPEG/WebP z hlavičky", () => {
  assert.equal(detectAttachmentMime(PDF), "application/pdf");
  assert.equal(detectAttachmentMime(PNG), "image/png");
  assert.equal(detectAttachmentMime(JPG), "image/jpeg");
  assert.equal(detectAttachmentMime(WEBP), "image/webp");
});

test("UNIT detectAttachmentMime: odmietne nepovolený obsah aj keď prípona lže", () => {
  assert.equal(detectAttachmentMime(EXE), null);
  assert.equal(detectAttachmentMime(HTML), null);
  assert.equal(detectAttachmentMime(new Uint8Array(0)), null);
});

test("UNIT detectAttachmentMime: odmietne skrátené/poškodené hlavičky", () => {
  assert.equal(detectAttachmentMime(new Uint8Array([0x25, 0x50])), null); // "%P"
  assert.equal(detectAttachmentMime(PNG.slice(0, 4)), null); // čiastočná PNG
  assert.equal(detectAttachmentMime(new Uint8Array([0x52, 0x49, 0x46, 0x46])), null); // RIFF bez WEBP
});

// ---------------------------------------------------------------------------
// UNIT — prípona
// ---------------------------------------------------------------------------

test("UNIT fileExtension: extrahuje príponu case-insensitive, inak prázdnu", () => {
  assert.equal(fileExtension("uctenka.PDF"), "pdf");
  assert.equal(fileExtension("fotka.jpeg"), "jpeg");

// ---------------------------------------------------------------------------
// UNIT — sanitizácia názvu
// ---------------------------------------------------------------------------

test("UNIT sanitizeFileName: path traversal je neutralizovaný", () => {
  for (const bad of [
    "../../etc/passwd",
    "..\\..\\windows\\system32\\config",
    "....//....//x",
  ]) {
    const safe = sanitizeFileName(bad);
    assert.ok(!safe.includes("/"), `${bad} -> ${safe}`);
    assert.ok(!safe.includes("\\"), `${bad} -> ${safe}`);
    assert.ok(!safe.startsWith(".."), `${bad} -> ${safe}`);
    assert.notEqual(safe, "..", bad);
    assert.notEqual(safe, ".", bad);
  }
});

test("UNIT sanitizeFileName: diakritika a medzery sa nahradia, dĺžka ohraničená", () => {
  assert.equal(sanitizeFileName("Účtenka č. 1.pdf"), "Uctenka-c.-1.pdf");
  assert.equal(sanitizeFileName("a".repeat(500)).length, 120);
  assert.equal(sanitizeFileName("///"), "subor");
  assert.equal(sanitizeFileName(""), "subor");
});

test("UNIT displayFileName: ponechá čitateľný basename, odstrihne control znaky", () => {
  assert.equal(displayFileName("../../etc/passwd"), "passwd");
  const withCtrl = displayFileName("evilname.pdf");
  assert.equal(withCtrl.includes("\u0000"), false);
  assert.equal(withCtrl.includes("\u0007"), false);
  assert.equal(displayFileName("   "), "priloha");
});

test("UNIT displayFileName: odstráni C0/C1 control znaky a DEL z názvu", () => {
  const dirty = `fakt\u0000ura\u0007\u001f\u007f\u0085.pdf`;
  const clean = displayFileName(dirty);
  for (const code of [0x00, 0x07, 0x1f, 0x7f, 0x85]) {
    assert.equal(clean.includes(String.fromCharCode(code)), false, `code ${code}`);
  }
  assert.ok(clean.includes("fakt"));
  assert.ok(clean.includes("ura"));
  assert.ok(clean.endsWith(".pdf"));
});

// ---------------------------------------------------------------------------
// STATIC — väzba cesty na transakciu (path binding)
// ---------------------------------------------------------------------------

test("STATIC attachmentPathTransactionId: zrkadlí public.finance_attachment_tx_id()", () => {
  assert.equal(attachmentPathTransactionId(`${TX_A}/faktura.pdf`), TX_A);
  assert.equal(attachmentPathTransactionId(`${TX_A.toUpperCase()}/x.pdf`), TX_A.toLowerCase());
  assert.equal(attachmentPathTransactionId("nie-uuid/x.pdf"), null);
  assert.equal(attachmentPathTransactionId("bez-lomitka"), null);
  assert.equal(attachmentPathTransactionId("/x.pdf"), null);
});

test("STATIC assertPathBinding: zhoda transaction_id s prvým segmentom cesty", () => {
  assert.equal(assertPathBinding(TX_A, `${TX_A}/1700000000000-faktura.pdf`), true);
  assert.equal(assertPathBinding(TX_A, `${TX_A.toUpperCase()}/x.pdf`), true);
});

test("STATIC assertPathBinding: manipulácia s transaction_id / cestou je odmietnutá", () => {
  // Prvý segment patrí inej transakcii (kľúčový IDOR vektor).
  assert.equal(assertPathBinding(TX_A, `${TX_B}/faktura.pdf`), false);
  // Traversál v zvyšku cesty.
  assert.equal(assertPathBinding(TX_A, `${TX_A}/../../${TX_B}/x.pdf`), false);
  assert.equal(assertPathBinding(TX_A, `${TX_A}//x.pdf`), false);
  // Bez súboru / bez lomítka.
  assert.equal(assertPathBinding(TX_A, `${TX_A}/`), false);
  assert.equal(assertPathBinding(TX_A, TX_A), false);
  // Nevalidné transactionId.
  assert.equal(assertPathBinding("not-a-uuid", "not-a-uuid/x.pdf"), false);
});

test("STATIC buildAttachmentPath: konvencia <transaction_id>/<ts>-<safe>", () => {
  const path = buildAttachmentPath(TX_A, "Účtenka č.1.pdf", 1_700_000_000_000);
  assert.equal(path, `${TX_A}/1700000000000-Uctenka-c.1.pdf`);
  assert.equal(assertPathBinding(TX_A, path), true);
});

test("STATIC buildAttachmentPath: odmietne ne-UUID transactionId", () => {
  assert.throws(() => buildAttachmentPath("../../etc", "x.pdf", 1), /UUID/);
  assert.throws(() => buildAttachmentPath("", "x.pdf", 1), /UUID/);
});

  assert.equal(fileExtension("bezpripony"), "");
  assert.equal(fileExtension("trazec."), "");
  assert.equal(fileExtension(".hidden"), "");
});

test("STATIC: allow-list prípon nepovoľuje .svg/.html/.exe/.js", () => {
  for (const bad of ["svg", "html", "htm", "exe", "js", "php", "zip"]) {
    assert.equal(ALLOWED_ATTACHMENT_EXTENSIONS.has(bad), false, bad);
  }
  assert.equal(ALLOWED_ATTACHMENT_EXTENSIONS.size, 5);
});
