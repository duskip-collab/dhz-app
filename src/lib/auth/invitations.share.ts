// K17.5 – Zdieľanie pozývacích kódov (WhatsApp / Messenger / clipboard / systém).
//
// BEZPEČNOSTNÉ ZÁSADY (preemptívne):
//  - Aplikácia NIKDY neposiela pozvánku sama (žiadne Graph API, žiadne
//    WhatsApp Business API, žiadne SMTP na kód).
//  - Otvorenie WhatsApp/Messenger okna alebo zdieľacieho háku NIE JE
//    potvrdením odoslania – UI musí to používateľovi výslovne oznámiť.
//  - Bezpečnosť pozvánky (jednorazovosť, expirácia, rola) sa NESMIE opierať
//    o kanál zdieľania. Kanál je iba preprava textu; platnosť overí až server.
//
// Tento modul je čisto funkčný (bez side-effectov) → testovateľný cez node --test.

// POZN.: relatívny import "./roles.ts" (nie "@/...") — node --test bez bundlera
// nevie alias; Next build prijíma oboje (tsconfig paths).
import { ROLE_LABELS, type AppRole } from "./roles.ts";
import type { ShareLinks, ShareMessageParams } from "./invitations.types.ts";

export const DEFAULT_ORGANIZATION_NAME = "DHZ RUŽINDOL";
export const APP_TITLE = "DHZ Ružindol";
export const REGISTRATION_PATH = "/register";

/**
 * Bezpečná abeceda pre pozývacie kódy – bez znakov, ktoré sa ľahko mýlia
 * (0/O, 1/I/l). 32 znakov → 5 bitov na znak → 3 skupiny po 4 znaky = 60 bitov.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Normalizácia kódu – MUSÍ byť identická s SQL
 * (20261111_invitation_codes.sql: upper(regexp_replace(btrim(...),
 * '[^A-Za-z0-9-]', '', 'g'))).
 */
export function normalizeInvitationCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

/**
 * Formát kódu: XXXX-XXXX-XXXX
 */
export function formatInvitationCode(groups: string[]): string {
  return groups.join("-");
}

/**
 * Auto-formátovanie vstupu používateľa na kód XXXX-XXXX-XXXX.
 *
 * - veľké písmená,
 * - odstránenie všetkých znakov mimo A-Z0-9,
 * - pomlčka vložená každé 4 znaky,
 * - max. 12 znakov (3 skupiny).
 *
 * Použitie: onChange v registračnom formulári.
 */
export function formatInvitationCodeInput(value: string): string {
  const cleaned = (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);

  const groups = cleaned.match(/.{1,4}/g);
  return groups ? groups.join("-") : "";
}

/**
 * Generovanie raw pozývacieho kódu cez Web Crypto (NE Math.random).
 * 60 bitov entropie.
 */
export function generateInvitationCode(): string {
  const bytes = new Uint8Array(12);
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error("Web Crypto (crypto.getRandomValues) nie je dostupné.");
  }
  cryptoObj.getRandomValues(bytes);

  const chars: string[] = [];
  for (const byte of bytes) {
    chars.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  }

  return formatInvitationCode([
    chars.slice(0, 4).join(""),
    chars.slice(4, 8).join(""),
    chars.slice(8, 12).join(""),
  ]);
}

/**
 * SHA-256 hex hash normalizovaného kódu – musí sedieť s SQL
 * (encode(digest(...::bytea,'sha256'),'hex')).
 */
export async function hashInvitationCode(code: string): Promise<string> {
  const normalized = normalizeInvitationCode(code);
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.subtle === "undefined") {
    throw new Error("Web Crypto (crypto.subtle) nie je dostupné.");
  }
  const data = new TextEncoder().encode(normalized);
  const digest = await cryptoObj.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// =============================================================================
// REGISTRAČNÁ URL
// =============================================================================

/**
 * Bezpečné zostavenie registračnej URL.
 *
 * - `NEXT_PUBLIC_APP_URL` má prednosť (deployment konfigurácia).
 * - Fallback je `window.location.origin` (iba v browseri).
 * - URL sa NORMALIZUJE a validuje (iba http/https).
 * - Ak URL nie je dostupná, vráti null → zdieľací text sa zostaví bez odkazu.
 */
export function resolveRegistrationUrl(
  explicitUrl?: string | null,
  origin?: string | null,
): string | null {
  const candidates = [explicitUrl, origin];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    try {
      const parsed = new URL(trimmed, "http://localhost");
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      const base = parsed.origin;
      // Ak kandidát obsahuje už cestu, použijeme ju; inak doplníme /register.
      const path =
        parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : REGISTRATION_PATH;
      return `${base}${path}`;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Načíta registračnú URL v browseri: preferuje `NEXT_PUBLIC_APP_URL`,
 * inak `window.location.origin`.
 */
export function getRegistrationUrlInBrowser(): string | null {
  if (typeof window === "undefined") return null;
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? null;
  return resolveRegistrationUrl(configured, window.location.origin);
}

/**
 * Env premenné, z ktorých sa dá odvodiť absolútna URL aplikácie.
 *
 * Priorita (pre Vercel deployment):
 *  1. `NEXT_PUBLIC_APP_URL` – explicitne nastavená produkčná URL (odporúčané),
 *  2. `NEXT_PUBLIC_VERCEL_URL` – produkčný host bez custom domény,
 *  3. `VERCEL_PROJECT_PRODUCTION_URL` – produkčný host z projektu,
 *  4. `VERCEL_URL` – deployment host (bezpečný fallback).
 *
 * `NEXT_PUBLIC_*` premenné sú dostupné aj v klientskom bundle (inlined pri
 * buildi), `VERCEL_*` iba na serveri.
 */
export function resolveAppUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const candidates = [
    env.NEXT_PUBLIC_APP_URL,
    env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${env.NEXT_PUBLIC_VERCEL_URL.replace(/^https?:\/\//, "")}`
      : undefined,
    env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "")}`
      : undefined,
    env.VERCEL_URL ? `https://${env.VERCEL_URL.replace(/^https?:\/\//, "")}` : undefined,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      return parsed.origin;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Registračná URL vypočítaná na serveri (pre Vercel).
 *
 * Vracia `null`, ak sa nedá zistiť žiadna platná URL → zdieľací text sa
 * zostaví bez odkazu (bezpečný fallback).
 */
export function getServerRegistrationUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return resolveRegistrationUrl(resolveAppUrlFromEnv(env), null);
}

// =============================================================================
// TEXTOVÉ ŠABLÓNY
// =============================================================================

export function formatExpiryForHumans(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return expiresAt;
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Predvyplnená pozývací správa.
 *
 * Kód je v texte (to je účel zdieľania), preto:
 *  - správa sa NIKDY neposiela cez URL ani analytics,
 *  - URL sa do textu pridáva IBA ak je platná a dostupná.
 */
export function buildInvitationMessage(params: ShareMessageParams): string {
  const roleLabel = ROLE_LABELS[params.role as AppRole] ?? params.role;
  const organization = params.organizationName?.trim() || DEFAULT_ORGANIZATION_NAME;
  const expiry = formatExpiryForHumans(params.expiresAt);
  const registrationUrl = params.registrationUrl ?? null;

  const lines: string[] = [
    `${organization} – pozvanie do ${APP_TITLE}`,
    "",
    "Dobrý deň,",
    `dostali ste pozvanie do digitálneho organizačného systému ${organization} (${APP_TITLE}) s rolou: ${roleLabel}.`,
    "",
    "Váš jednorazový pozývací kód:",
    params.code,
    "",
    `Platnosť kódu: ${expiry}`,
  ];

  if (registrationUrl) {
    lines.push(`Registrácia: ${registrationUrl}`);
    lines.push("");
    lines.push("Postup:");
    lines.push(`1. Otvorte ${registrationUrl}`);
    lines.push("2. Zadajte e-mail, silné heslo a tento pozývací kód");
    lines.push("3. Potvrďte registráciu a prihláste sa");
  } else {
    lines.push("");
    lines.push("Registračný odkaz sa pridá po otvorení registračnej stránky.");
    lines.push("Postup:");
    lines.push("1. Otvorte registračnú stránku DHZ Ružindol");
    lines.push("2. Zadajte e-mail, silné heslo a tento pozývací kód");
    lines.push("3. Potvrďte registráciu a prihláste sa");
  }

  lines.push("");
  lines.push("Kód je jednorazový a po registrácii stráca platnosť.");

  return lines.join("\n");
}

// =============================================================================
// ZDIELACIE ODKAZY
// =============================================================================

/**
 * WhatsApp deep-link – otvorí WhatsApp (web/app) s predvyplnenou správou.
 * Užívateľ musí odoslanie potvrdiť sám.
 */
export function buildWhatsAppLink(message: string, phone?: string | null): string {
  const encoded = encodeURIComponent(message);
  const digits = phone ? phone.replace(/[^\d]/g, "") : "";
  return digits
    ? `https://wa.me/${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

/**
 * Základná URL pre Messenger.
 *
 * Messenger NEPREFILTRUJE text (na to je potrebný Meta Send Dialog s App ID
 * a schválenou redirect_uri, čo vyžaduje schválenie Meta aplikácie).
 * Namiesto toho sa používateľovi ponúkne textové pole, do ktorého text
 * vloží skopírovaný obsah (Ctrl+V / Ctrl+Shift+V).
 */
export const MESSENGER_BASE_URL = "https://www.messenger.com";

/**
 * Messenger odkaz – otvorí Messenger (web/app). Text sa NEpredvyplní,
 * používateľ ho vloží zo schránky.
 */
export function buildMessengerLink(): string {
  return MESSENGER_BASE_URL;
}

/**
 * Vráti dostupné zdieľacie odkazy.
 *
 * `whatsapp` – deep link s predvyplneným textom.
 * `messenger` – otvorenie Messengeru, text sa vkladá ručne zo schránky.
 */
export function buildShareLinks(message: string): ShareLinks {
  return {
    whatsapp: buildWhatsAppLink(message),
    messenger: buildMessengerLink(),
  };
}

/**
 * Je v tomto prostredí dostupný systémový share (Web Share API)?
 */
export function canUseSystemShare(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.share === "function";
}

/**
 * Je dostupný Messenger kanál?
 *
 * Od Messenger Send Dialogu sme upustili (potreboval schválenú Meta App +
 * redirect_uri). Teraz sa otvára bežný Messenger, do ktorého používateľ
 * vloží skopírovaný text → kanál je VŽDY dostupný.
 */
export function canUseMessenger(): boolean {
  return true;
}
