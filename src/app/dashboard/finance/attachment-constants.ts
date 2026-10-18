/**
 * K13.2.3 — Zdieľaná, framework-nezávislá politika pre prílohy financií.
 *
 * DÔVOD ODDELENÉHO SÚBORU (nie vedľa `"use server"`):
 * Next.js pri build/runtime validuje KAŽDÝ export modulu s direktívou
 * `"use server"` a povoľuje výhradne async funkcie:
 *
 *   node_modules/next/dist/build/webpack/loaders/next-flight-loader/
 *   action-validate.js
 *   -> `A "use server" file can only export async functions, found <type>.`
 *
 * Konštanty (`ATTACHMENT_BUCKET`, `MAX_ATTACHMENT_BYTES`,
 * `ALLOWED_ATTACHMENT_TYPES`) potrebuje AJ klientsky komponent
 * `AttachmentManager.tsx`, preto tu NESMÚ ostat — inak by build/runtime padol.
 *
 * Tento modul zámerne NEIMPORTUJE nič z `@/...` ani `next/*`, aby bol
 * priamo testovateľný čistým `node --test` bez bundlera a bez path aliasov.
 *
 * Hodnoty sú držané v súlade s migráciami:
 *   * 20261016_finance_storage.sql       -> bucket, limity, allowed_mime_types
 *   * 20261017_finance_storage_hardening -> väzba cesty `<transaction_id>/<file>`
 */

/** Privátny bucket (storage.buckets.public = false, migrácia 20261016). */
export const ATTACHMENT_BUCKET = "finance_documents";

/** Tvrdý limit na jeden súbor. MUSÍ zodpovedať storage.buckets.file_size_limit. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10485760

/** Platnosť signed URL v sekundách. */
export const SIGNED_URL_TTL_SECONDS = 300;

/** Allow-list MIME typov — zrkadlí storage.buckets.allowed_mime_types (20261016). */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedAttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

/**
 * Set pre rýchle overenie. Ponechané pod pôvodným názvom, aby ho mohol
 * používať aj klientsky komponent.
 */
export const ALLOWED_ATTACHMENT_TYPES: ReadonlySet<string> = new Set(
  ALLOWED_ATTACHMENT_MIME_TYPES,
);

/**
 * Allow-list prípon -> MIME typ, ktorý MUSÍ zodpovedať skutočnému obsahu.
 * Chýbajúce mapovanie = prípona nie je povolená.
 */
export const ALLOWED_ATTACHMENT_EXTENSIONS: ReadonlyMap<string, AllowedAttachmentMimeType> =
  new Map([
    ["pdf", "application/pdf"],
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ]);

// ---------------------------------------------------------------------------
// UUID
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prísna validácia UUID. Odporuje injekcii a „uuid-ish“ vstupom. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// ---------------------------------------------------------------------------
// Názov súboru
// ---------------------------------------------------------------------------

/**
 * Sanitizácia názvu súboru pre bezpečné uloženie do Storage.
 * - vezme iba basename (`/`, `\`) -> nie je možné uniknúť z priečinka,
 * - odstráni diakritiku, nepovolené znaky nahradí `-`,
 * - odstrihne úvodné/koncové `.` `-` `_`, takže `..`, `.`, `...` nemôžu prežiť,
 * - obmedzí dĺžku na 120 znakov.
 */
export function sanitizeFileName(name: string): string {
  const raw = typeof name === "string" ? name : "";
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.\-_]+/, "")
    .replace(/[.\-_]+$/, "")
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "subor";
}

/**
 * Odstráni C0/C1 control znaky a DEL. Robené explicitne cez code points,
 * aby neboli v zdrojáku záhadné escape sekvencie.
 */
function stripControlChars(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    out += ch;
  }
  return out;
}

/**
 * Názov pre zobrazenie/uloženie do metadát: basename bez control znakov.
 * (React escapuje textové uzle, no control znaky do audit_log tiež nechceme.)
 */
export function displayFileName(name: string): string {
  const base = (typeof name === "string" ? name : "").split(/[\\/]/).pop() ?? "";
  const cleaned = stripControlChars(base).trim();
  return cleaned.length > 0 ? cleaned.slice(0, 255) : "priloha";
}

/** Prípona bez bodky, malými písmenami. Pre názov bez bodky vracia `""`. */
export function fileExtension(name: string): string {
  const base = (typeof name === "string" ? name : "").split(/[\\/]/).pop() ?? "";
  const idx = base.lastIndexOf(".");
  if (idx <= 0 || idx === base.length - 1) return "";
  return base.slice(idx + 1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Detekcia MIME typu podľa MAGIC BYTES (nikdy neveríme File.type)
// ---------------------------------------------------------------------------

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.byteLength < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.byteLength) return "";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[offset + i] as number);
  }
  return out;
}

const SIG_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Zistí skutočný MIME typ z hlavičky súboru (magic bytes).
 * Vracia `null`, ak obsah nezodpovedá žiadnemu povolenému typu — teda aj pre
 * súbor s korektnou príponou `.pdf`, ktorého obsah nie je PDF.
 */
export function detectAttachmentMime(bytes: Uint8Array): AllowedAttachmentMimeType | null {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return null;

  if (asciiAt(bytes, 0, 5) === "%PDF-") return "application/pdf";
  if (startsWith(bytes, SIG_PNG)) return "image/png";
  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Väzba cesty objektu na transakciu (`<transaction_id>/<file>`)
// ---------------------------------------------------------------------------

/**
 * Vráti `transaction_id` z prvej časti cesty objektu, alebo `null`, ak prvá
 * časť nie je platné UUID / cesta neobsahuje `/`.
 * Zrkadlí `public.finance_attachment_tx_id()` z migrácie 20261017.
 */
export function attachmentPathTransactionId(storagePath: string): string | null {
  if (typeof storagePath !== "string") return null;
  const idx = storagePath.indexOf("/");
  if (idx <= 0) return null;
  const first = storagePath.slice(0, idx);
  return isUuid(first) ? first.toLowerCase() : null;
}

/**
 * Overí väzbu cesty na transakciu:
 *   * `transactionId` je UUID,
 *   * prvý segment cesty == `transactionId` (case-insensitive),
 *   * zvyšné segmenty sú neprázdne a nie `.` / `..` (žiadna traversál).
 */
export function assertPathBinding(transactionId: string, storagePath: string): boolean {
  if (!isUuid(transactionId)) return false;
  const pathTx = attachmentPathTransactionId(storagePath);
  if (pathTx === null) return false;
  if (pathTx !== transactionId.toLowerCase()) return false;

  const slash = storagePath.indexOf("/");
  const rest = storagePath.slice(slash + 1);
  if (rest.length === 0) return false;
  for (const segment of rest.split("/")) {
    if (segment === "" || segment === "." || segment === "..") return false;
  }
  return true;
}

/**
 * Zostaví cestu objektu podľa konvencie z migrácie 20261017.
 * Hodí výnimku, ak by výsledná cesta porušila väzbu na transakciu.
 */
export function buildAttachmentPath(
  transactionId: string,
  fileName: string,
  timestampMs: number,
): string {
  if (!isUuid(transactionId)) {
    throw new Error("transactionId must be a UUID");
  }
  const safe = sanitizeFileName(fileName);
  const ts = Number.isFinite(timestampMs) && timestampMs > 0 ? Math.floor(timestampMs) : 0;
  const path = `${transactionId}/${ts}-${safe}`;
  if (!assertPathBinding(transactionId, path)) {
    throw new Error("constructed storage path violates the attachment path binding");
  }
  return path;
}
