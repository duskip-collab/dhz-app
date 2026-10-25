// Unit testy pre K17.5 – pozývacie kódy: normalizácia, generovanie, hash,
// formátovanie zdieľacích textov a odkazy. Čisto funkčné moduly (bez DB).
// Spustenie: node --test src/lib/auth/invitations.share.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_ALPHABET,
  buildInvitationMessage,
  buildMessengerLink,
  buildShareLinks,
  buildWhatsAppLink,
  canUseMessenger,
  formatInvitationCode,
  formatInvitationCodeInput,
  generateInvitationCode,
  getServerRegistrationUrl,
  hashInvitationCode,
  normalizeInvitationCode,
  resolveAppUrlFromEnv,
  resolveRegistrationUrl,
} from "./invitations.share.ts";

test("normalizeInvitationCode: trim + upper + odstránenie neplatných znakov", () => {
  assert.equal(normalizeInvitationCode("  abcd-efgh-ijkl  "), "ABCD-EFGH-IJKL");
  assert.equal(normalizeInvitationCode("abcd efgh ijkl"), "ABCDEFGHIJKL");
  // Normalizácia musí byť identická s SQL: regexp_replace(btrim(...), '[^A-Za-z0-9-]', '', 'g')
  assert.equal(normalizeInvitationCode("a!b@c#d$e-f"), "ABCDE-F");
});

test("normalizeInvitationCode: zachová pomlčky (formát XXXX-XXXX-XXXX)", () => {
  assert.equal(normalizeInvitationCode("ABCD-EFGH-IJKL"), "ABCD-EFGH-IJKL");
});

test("formatInvitationCodeInput: auto-formátovanie na XXXX-XXXX-XXXX", () => {
  assert.equal(formatInvitationCodeInput("abcd"), "ABCD");
  assert.equal(formatInvitationCodeInput("abcdefgh"), "ABCD-EFGH");
  assert.equal(formatInvitationCodeInput("abcdefghijkl"), "ABCD-EFGH-IJKL");
  // Neplatné znaky sa odstránia, medzery sa ignorujú.
  assert.equal(formatInvitationCodeInput("ab cd-ef gh"), "ABCD-EFGH");
  // Vstup sa nikdy nepredĺži na viac než 3 skupiny.
  assert.equal(formatInvitationCodeInput("abcdefghijklmnop"), "ABCD-EFGH-IJKL");
  assert.equal(formatInvitationCodeInput(""), "");
  assert.equal(formatInvitationCodeInput("---"), "");
});

test("generateInvitationCode: formát 3 skupiny po 4 znaky, bez mýlnych znakov", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateInvitationCode();
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(code.length, 14);
    // Skupiny tvoria iba znaky z bezpečnej abecedy (pomlčka je oddeľovač).
    for (const ch of code.replace(/-/g, "")) {
      assert.ok(CODE_ALPHABET.includes(ch), `neplatný znak v kóde: ${ch}`);
    }
    // Bez znakov, ktoré sa ľahko mýlia (0/O, 1/I/l).
    assert.ok(!/[01IlO]/.test(code));
  }
});

test("generateInvitationCode: kódy sú unikátne (entropia z Web Crypto)", () => {
  const codes = new Set<string>();
  for (let i = 0; i < 200; i++) {
    codes.add(generateInvitationCode());
  }
  assert.equal(codes.size, 200);
});

test("hashInvitationCode: deterministický pre normalizovaný kód, 64 hex znakov", async () => {
  const hash = await hashInvitationCode("ABCD-EFGH-IJKL");
  assert.match(hash, /^[0-9a-f]{64}$/);

  // Rôzne formy zápisu tej istého kódu dávajú rovnaký hash.
  assert.equal(await hashInvitationCode("abcd-efgh-ijkl"), hash);
  assert.equal(await hashInvitationCode("  ABCD-EFGH-IJKL  "), hash);

  // Rôzne kódy → rôzne hashe.
  assert.notEqual(await hashInvitationCode("ABCD-EFGH-IJKM"), hash);
});

test("formatInvitationCode: spája skupiny pomlčkou", () => {
  assert.equal(formatInvitationCode(["AAAA", "BBBB", "CCCC"]), "AAAA-BBBB-CCCC");
});

test("resolveRegistrationUrl: preferuje konfiguračnú URL a doplní /register", () => {
  assert.equal(
    resolveRegistrationUrl("https://app.dhz.sk"),
    "https://app.dhz.sk/register",
  );
  assert.equal(
    resolveRegistrationUrl(null, "https://staging.dhz.sk"),
    "https://staging.dhz.sk/register",
  );
});

test("resolveRegistrationUrl: explicitná cesta sa zachová", () => {
  assert.equal(
    resolveRegistrationUrl("https://app.dhz.sk/register"),
    "https://app.dhz.sk/register",
  );
});

test("resolveRegistrationUrl: neplatné URL → null (text bez odkazu)", () => {
  assert.equal(resolveRegistrationUrl(null, null), null);
  assert.equal(resolveRegistrationUrl("   ", null), null);
  assert.equal(resolveRegistrationUrl("javascript:alert(1)", null), null);
  assert.equal(resolveRegistrationUrl("ftp://app.dhz.sk", null), null);
});

test("buildInvitationMessage: obsahuje kód, rolu a platnosť", () => {
  const message = buildInvitationMessage({
    code: "ABCD-EFGH-IJKL",
    role: "VELITEL",
    expiresAt: "2026-12-01T10:00:00.000Z",
    registrationUrl: "https://app.dhz.sk/register",
  });

  assert.ok(message.includes("ABCD-EFGH-IJKL"));
  assert.ok(message.includes("Veliteľ"));
  assert.ok(message.includes("https://app.dhz.sk/register"));
  assert.ok(message.includes("jednorazový"));
});

test("buildInvitationMessage: bez registračnej URL sa odkaz nepridá", () => {
  const message = buildInvitationMessage({
    code: "ABCD-EFGH-IJKL",
    role: "CLEN",
    expiresAt: "2026-12-01T10:00:00.000Z",
    registrationUrl: null,
  });

  assert.ok(message.includes("ABCD-EFGH-IJKL"));
  assert.ok(!message.includes("http"));
  assert.ok(message.includes("Registračný odkaz sa pridá"));
});

test("buildWhatsAppLink: obsahuje URL-encoded text", () => {
  const link = buildWhatsAppLink("Kód: ABCD-EFGH-IJKL");
  assert.ok(link.startsWith("https://wa.me/?text="));
  assert.ok(link.includes(encodeURIComponent("ABCD-EFGH-IJKL")));
  // Text je URL-encoded (medzera a medz-diaľkové znaky sú escapované).
  assert.ok(!link.includes("Kód: ABCD"));
});

test("buildWhatsAppLink: s telefónnym číslom", () => {
  const link = buildWhatsAppLink("text", "+421 900 123 456");
  assert.ok(link.startsWith("https://wa.me/421900123456?text="));
});

test("buildMessengerLink: otvára Messenger bez predvyplneného textu", () => {
  const link = buildMessengerLink();
  assert.equal(link, "https://www.messenger.com");
  assert.ok(!link.includes("text="));
});

test("buildShareLinks: whatsapp + messenger sú vždy dostupné", () => {
  const links = buildShareLinks("text");
  assert.ok(links.whatsapp.startsWith("https://wa.me/?text="));
  assert.equal(links.messenger, "https://www.messenger.com");
});

test("canUseMessenger: kanál je vždy dostupný (text sa vkladá cez Ctrl+V)", () => {
  assert.equal(canUseMessenger(), true);
});

test("resolveAppUrlFromEnv: priorita NEXT_PUBLIC_APP_URL", () => {
  assert.equal(
    resolveAppUrlFromEnv({
      NEXT_PUBLIC_APP_URL: "https://app.dhz.sk",
      VERCEL_URL: "my-app.vercel.app",
    }),
    "https://app.dhz.sk",
  );
});

test("resolveAppUrlFromEnv: fallback na VERCEL_* premenné", () => {
  assert.equal(
    resolveAppUrlFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: "my-app.vercel.app" }),
    "https://my-app.vercel.app",
  );
  assert.equal(
    resolveAppUrlFromEnv({ VERCEL_URL: "my-app-abc123.vercel.app" }),
    "https://my-app-abc123.vercel.app",
  );
  assert.equal(
    resolveAppUrlFromEnv({ NEXT_PUBLIC_VERCEL_URL: "https://my-app.vercel.app" }),
    "https://my-app.vercel.app",
  );
});

test("resolveAppUrlFromEnv: neplatná alebo chýbajúca env → null", () => {
  assert.equal(resolveAppUrlFromEnv({}), null);
  assert.equal(resolveAppUrlFromEnv({ NEXT_PUBLIC_APP_URL: "  " }), null);
  assert.equal(resolveAppUrlFromEnv({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" }), null);
});

test("getServerRegistrationUrl: z env zostaví /register URL", () => {
  assert.equal(
    getServerRegistrationUrl({ NEXT_PUBLIC_APP_URL: "https://app.dhz.sk" }),
    "https://app.dhz.sk/register",
  );
  assert.equal(getServerRegistrationUrl({}), null);
});
