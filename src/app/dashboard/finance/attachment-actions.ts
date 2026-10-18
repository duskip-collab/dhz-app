"use server";

// Server actions pre prilohy transakcii (K13.2.3 security review).
//
// BUCKET / LIMITY / VALIDACIA su v `./attachment-constants`.
// DOVOD: modul s direktivou `"use server"` moze exportovat IBA async funkcie
// (next/dist/build/webpack/loaders/next-flight-loader/action-validate.js).
// Konstanty tu preto NIE SU.
//
// Bezpecnostny model (viacvrstvovy):
//   1. Autentifikacia — vzdy serverovy Supabase klient so session z cookies
//      (`@/lib/supabase/server`, anon key + JWT pouzivatela => RLS plati).
//   2. Autorizacia — explicina kontrola oprávnení z existujuceho katalógu
//      (`PERMISSIONS.FINANCE_VIEW / FINANCE_CREATE / FINANCE_EDIT`).
//      Ziadne nove opravnenia, ziadne `finance.post` / `finance.void`.
//   3. IDOR ochrana — priloha je vzdy nacitana cez RLS; ak pouzivatel nema
//      pristup k transakcii, riadok sa jednoducho nenajde.
//   4. DRAFT-only — serverovy gate pred kazdym zapisom + RLS/Storage ako 2. vrstva.
//   5. Path binding — cesta musi mat tvar `<transaction_id>/<file>` a prvy
//      segment sa musi zhodovat s `transaction_id` metadat.
//   6. Validacia suboru — velkost + MAGIC BYTES + prípona (nie `File.type`).
//   7. Chyby — do odpovede nikdy neunesieme interne detaily, tokeny ani URL.
//
// OGRANICENIE (dokumentovane): Postgres a Supabase Storage NIE su v jednej
// transakcii. Upload/delete objektu a zapis metadat preto nemozu byt atomicke.
// Kompenzacne operacie (rollback objektu, hlasenie siroty) su explicitne
// osetrene nizsie.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/server";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type {
  FinanceTransactionAttachmentRow,
  FinanceTransactionStatus,
} from "@/types/database.types";
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_ATTACHMENT_TYPES,
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  SIGNED_URL_TTL_SECONDS,
  assertPathBinding,
  buildAttachmentPath,
  detectAttachmentMime,
  displayFileName,
  fileExtension,
  isUuid,
} from "./attachment-constants";

// POZNÁMKA: konštanty (`ATTACHMENT_BUCKET`, `MAX_ATTACHMENT_BYTES`,
// `ALLOWED_ATTACHMENT_TYPES`) sa ZOAMLNE NEEXPORTUJÚ aj odtiaľto. Modul s
// direktívou `"use server"` smie exportovať iba async funkcie — prijatá
// re-exportom by pretlačila validácia Next.js
// (`A "use server" file can only export async functions, found object`).
// Klient ich importuje priamo z `./attachment-constants`.

export type AttachmentActionState =
  | { ok: true; attachmentId?: string; path?: string }
  | { ok: false; errors: Record<string, string>; message: string };

function fail(message: string, errors: Record<string, string> = {}): AttachmentActionState {
  return { ok: false, errors, message };
}

/**
 * Jednotne, bezpecne zpracovanie chyb. Nikdy nevraciame `error.message` z
 * PostgREST/Storage do klienta — tie mozu obsahovat nazvy stlpcov, politiky,
 * cesty ani casti tokenov. Detail logujeme iba serverovo.
 */
function failUnknown(
  e: unknown,
  fallback: string,
  logLabel: string,
): AttachmentActionState {
  const status = (e as { statusCode?: number } | null)?.statusCode ?? 500;
  if (status === 403) return fail("Nemate opravnenie.");
  if (status === 401) return fail("Nie ste prihlaseny.");
  if (status === 404) return fail("Zaznam sa nenasiel.");
  if (process.env.NODE_ENV !== "production") {
    console.error(`[attachments:${logLabel}]`, e);
  }
  return fail(fallback);
}

type TxStatusRow = { id: string; status: FinanceTransactionStatus };

type Db = Awaited<ReturnType<typeof createClient>>;
// Volny pristup k tabulkam cez unknown-cast (typed klient nema genericke Args
// pre tieto tabulky v niektorych rezimoch inferencie).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

const REVALIDATE_PATHS = ["/dashboard/finance", "/dashboard/finance/transactions"];

function revalidateAttachments(): void {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

/**
 * Autorizacny gate. Overuje prihlaseneho pouzivatela a pozadovane opravnenie
 * z existujuceho katalogu. Pri zlyhani vracia hotovy `fail()` state, aby sa
 * akcia nedostala k jedinej DB/Storage operacii.
 */
async function requirePermission(
  permission: Permission,
): Promise<{ ok: true; userId: string } | { ok: false; state: AttachmentActionState }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.permissions.includes(permission)) {
      return { ok: false, state: fail("Nemate opravnenie.") };
    }
    return { ok: true, userId: ctx.userId };
  } catch {
    return { ok: false, state: fail("Nie ste prihlaseny.") };
  }
}

/**
 * Overi existenciu transakcie a jei aktualny stav PRIAMO na serveri.
 * `single()` prejde cez RLS, takze pouzivatel bez `finance.view` transakciu
 * „nevidi“ — pre neho je transakcia neexistujuca (IDOR ochrana).
 */
async function requireDraftTransaction(
  supabase: Db,
  transactionId: string,
): Promise<{ ok: true } | { ok: false; state: AttachmentActionState }> {
  const db = supabase as AnyDb;
  const found: { error: { message: string } | null; data: TxStatusRow | null } = await db
    .from("finance_transactions")
    .select("id,status")
    .eq("id", transactionId)
    .single();
  if (found.error || !found.data) {
    // Nelisime „neexistuje“ vs „nemate opravnenie“ — inak by sme potvrdzovali
    // existenciu cudzieho UUID.
    return { ok: false, state: fail("Transakcia sa nenasla.") };
  }
  const row = found.data as TxStatusRow;
  if (row.status !== "DRAFT") {
    return {
      ok: false,
      state: fail("Prilohy je mozne menit len pri transakcii v stave DRAFT."),
    };
  }
  return { ok: true };
}

/**
 * Nacita prilohy transakcie.
 * Opravnenie: `finance.view` (citananie). Zapisy sa tu nedeju, DRAFT gate
 * sa neuplatnuje — POSTED/VOID doklady sa daju zobrazit (zhoda so Storage
 * politikou `can_read_finance_attachment` z migracie 20261017).
 *
 * IDOR: `transaction_id` sa najprv rigorozne validuje ako UUID; riadky idu
 * cez RLS, takze pouzivatel bez `finance.view` nedostane ziadny riadok.
 */
export async function loadTransactionAttachments(
  transactionId: string,
): Promise<FinanceTransactionAttachmentRow[]> {
  if (!isUuid(transactionId)) return [];

  const auth = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  if (!auth.ok) return [];

  const supabase = await createClient();
  const db = supabase as AnyDb;
  const loaded: {
    error: { message: string } | null;
    data: FinanceTransactionAttachmentRow[] | null;
  } = await db
    .from("finance_transaction_attachments")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("uploaded_at", { ascending: false });
  // Nehadzeme raw DB chybu do klienta (unesie obsah RLS/DDL).
  if (loaded.error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[attachments:load]", loaded.error);
    }
    throw new Error("Nacitanie priloh zlyhalo.");
  }
  return loaded.data ?? [];
}


/**
 * Nahra prilohu k DRAFT transakcii.
 * Opravnenie: `finance.create` (zhoda so Storage politikou INSERT a
 * `finance_attach_insert` z migracie 20261015).
 *
 * Validacia suboru je SERVEROVA a NESPOCIVA na `File.type`:
 *   1. velkost (> 0 a <= MAX_ATTACHMENT_BYTES),
 *   2. skutocny MIME typ z MAGIC BYTES obsahu,
 *   3. prípona musi byt v allow-liste a sediet s detekovanym obsahom,
 *   4. deklarovany `File.type` (ak je) musi sediet s detekovanym obsahom.
 *
 * Path binding: cesta je VZDY `<transaction_id>/<timestamp>-<safe>`; ak by
 * prvy segment nezodpovedal `transaction_id`, `buildAttachmentPath` hodi chybu.
 *
 * KONZISTENCIA (dokumentovane): Storage a Postgres NIE su v jednej transakcii.
 * Ak zlyha insert metadat po uspesnom uploade, objekt okamzite odstranime
 * (kompenzacia). Ak zlyha aj to, objekt zostane ako sirota — pozri report.
 */
export async function uploadTransactionAttachment(
  transactionId: string,
  _prev: AttachmentActionState | null,
  formData: FormData,
): Promise<AttachmentActionState> {
  // 1) Tvar vstupu — bez napojenia na DB.
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Vyberte subor.", { file: "Vyberte subor." });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return fail("Subor je prilis velky.", { file: "Maximalna velkost je 10 MB." });
  }
  if (!isUuid(transactionId)) {
    return fail("Neplatna transakcia.");
  }

  // Prípona musi byt v allow-liste (UX signal, niesu doveruhodny sam o sebe).
  const ext = fileExtension(file.name);
  const extMime = ext ? ALLOWED_ATTACHMENT_EXTENSIONS.get(ext) : undefined;
  if (!extMime) {
    return fail("Nepodporovany format.", { file: "Povolene su PDF, JPG, PNG, WebP." });
  }

  try {
    // 2) Autentifikacia + autorizacia z existujuceho katalogu opravneni.
    const auth = await requirePermission(PERMISSIONS.FINANCE_CREATE);
    if (!auth.ok) return auth.state;

    const supabase = await createClient();

    // 3) Serverovy DRAFT gate.
    const gate = await requireDraftTransaction(supabase, transactionId);
    if (!gate.ok) return gate.state;

    // 4) Skutocny typ obsahu — NIKDY neverime `file.type`.
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return fail("Subor je prilis velky.", { file: "Maximalna velkost je 10 MB." });
    }
    const sniffed = detectAttachmentMime(bytes);
    if (!sniffed || !ALLOWED_ATTACHMENT_TYPES.has(sniffed)) {
      return fail("Nepodporovany format.", { file: "Povolene su PDF, JPG, PNG, WebP." });
    }
    // Obsah musi sediet s príponou aj s deklarovanym typom (ak bol uvedeny).
    if (sniffed !== extMime) {
      return fail("Nepodporovany format.", { file: "Obsah suboru nezodpoveda pripone." });
    }
    if (file.type && file.type !== sniffed) {
      return fail("Nepodporovany format.", { file: "Obsah suboru nezodpoveda jeho typu." });
    }

    // 5) Cesta viazana na transakciu (path binding).
    const path = buildAttachmentPath(transactionId, file.name, Date.now());

    // 6) Upload objektu. `upsert: false` => ziadne tiche prepisanie.
    const up = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, {
      contentType: sniffed,
      upsert: false,
    });
    if (up.error) {
      return fail("Nahravanie do uloziska zlyhalo.", {
        file: "Skontrolujte format a velkost suboru.",
      });
    }

    // 7) Metadata. `uploaded_by` berieme IBA z overenej identity; ak ho
    //    vynucuje DB trigger, hodnota je rovnaka (viD migration 20261020).
    const meta: {
      error: { message: string } | null;
      data: FinanceTransactionAttachmentRow | null;
    } = await (supabase as AnyDb)
      .from("finance_transaction_attachments")
      .insert({
        transaction_id: transactionId,
        storage_path: path,
        file_name: displayFileName(file.name),
        mime_type: sniffed,
        file_size_bytes: bytes.byteLength,
        uploaded_by: auth.userId,
      })
      .select()
      .single();

    if (meta.error || !meta.data) {
      // KOMPENZACIA: objekt je v Storage, metadata nie -> odstranime objekt.
      const cleanup = await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
      if (cleanup.error && process.env.NODE_ENV !== "production") {
        console.error("[attachments:upload] rollback objektu zlyhalo", cleanup.error);
      }
      return fail("Ulozenie metadat prilohy zlyhalo.", { file: "Skuste to znova." });
    }

    revalidateAttachments();
    const row = meta.data as FinanceTransactionAttachmentRow;
    return { ok: true, attachmentId: row.id, path };
  } catch (e) {
    return failUnknown(e, "Nahravanie zlyhalo.", "upload");
  }
}


/**
 * Vymaze prilohu (metadata + objekt v Storage).
 * Opravnenie: `finance.edit` (zhoda so `finance_attach_delete` z 20261015
 * a Storage politikou DELETE / `can_modify_finance_attachment` z 20261017).
 *
 * PORADIE OPERACII (zmenene oproti K13.2.2):
 *   Najprv odstranime OBJEKT, az potom METADATA.
 *   Dovod: ak zlyha odstranenie metadat, objekt uz nie je v Storage — vznikne
 *   „mrtvy“ metadata riadok, ktory je VIDITELNY a uzivatel moze skusit znova.
 *   V opacnom poradi (metadata -> objekt) by zlyhanie objektu zanechalo
 *   NEVIDITELNU sirotu v Storage, ktoru nikto nezmazanie.
 *
 * IDOR / DRAFT: metadata riadok sa cita cez RLS (takze cudzia priloha „neexistuje“),
 * DRAFT gate sa overuje serverovo, delete metadat je navyse vedeny aj podla
 * `transaction_id` a `storage_path`, aby sa nemazal iny riadok.
 *
 * ATOMICITA: Postgres a Storage NIE su v jednej transakcii — tieto dve operacie
 * nie su atomicke. Dokumentovane v reporte.
 */
export async function deleteTransactionAttachment(
  attachmentId: string,
): Promise<AttachmentActionState> {
  if (!isUuid(attachmentId)) return fail("Priloha sa nenasla.");

  try {
    // 1) Autentifikacia + autorizacia.
    const auth = await requirePermission(PERMISSIONS.FINANCE_EDIT);
    if (!auth.ok) return auth.state;

    const supabase = await createClient();

    // 2) Nacitanie ciela cez RLS (cudzia priloha sa nenajde).
    const target: {
      error: { message: string } | null;
      data: Pick<
        FinanceTransactionAttachmentRow,
        "id" | "transaction_id" | "storage_path"
      > | null;
    } = await (supabase as AnyDb)
      .from("finance_transaction_attachments")
      .select("id,transaction_id,storage_path")
      .eq("id", attachmentId)
      .single();
    if (target.error || !target.data) {
      return fail("Priloha sa nenasla.");
    }
    const row = target.data as Pick<
      FinanceTransactionAttachmentRow,
      "id" | "transaction_id" | "storage_path"
    >;

    // 3) Ochrana pred manipulaciou s `storage_path` ulozenym v DB: cesta musi
    //    byt viazana na rodicovsku transakciu, inak ju odmietneme.
    if (!assertPathBinding(row.transaction_id, row.storage_path)) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[attachments:delete] neplatna väzba cesty", attachmentId);
      }
      return fail("Priloha sa nenasla.");
    }

    // 4) Serverovy DRAFT gate.
    const gate = await requireDraftTransaction(supabase, row.transaction_id);
    if (!gate.ok) return gate.state;

    // 5) Odstranenie objektu. Supabase Storage vracia chybu aj ked objekt
    //    neexistuje; pokus o opakovane zmazanie preto neblokujeme.
    const delObj = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .remove([row.storage_path]);
    if (delObj.error) {
      return fail("Odstranenie suboru z uloziska zlyhalo.", { file: "Skuste to znova." });
    }

    // 6) Odstranenie metadat — vedene aj podla transaction_id a storage_path.
    const delMeta = await (supabase as AnyDb)
      .from("finance_transaction_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("transaction_id", row.transaction_id)
      .eq("storage_path", row.storage_path);
    if (delMeta.error) {
      // Objekt je prec, metadata nie. Metadata riadok je viditelny, takze
      // pouzivatel moze akciu opakovat; nehlásime to ako plny uspech.
      if (process.env.NODE_ENV !== "production") {
        console.error("[attachments:delete] odstranenie metadat zlyhalo", delMeta.error);
      }
      return fail("Subor bol odstraneny, ale zaznam o prilohe sa nepodarilo zmazat.", {
        file: "Obnovte stranku a skuste to znova.",
      });
    }

    revalidateAttachments();
    return { ok: true, attachmentId };
  } catch (e) {
    return failUnknown(e, "Vymazanie zlyhalo.", "delete");
  }
}


/**
 * Vyda casovo obmedzenu signed URL na stiahnutie prilohy.
 * Opravnenie: `finance.view` (zhoda so Storage politikou SELECT /
 * `can_read_finance_attachment` z 20261017, ktora povoluje akukolvek existujucu
 * transakciu — POSTED/VOID doklady sa daju stiahnut).
 *
 * PORADIE: opravnenie a vlastnictvo/pristup sa overuju PRED vydanim signed URL.
 * Signed URL sa nikdy nevracia v chybovej odpovedi ani sa neloguje.
 *
 * OGRANICENIE MECHANIZMU (dokumentovane, nie oprávnene odvolanie):
 * signed URL je pouzitelna az do svojho expiracie (300 s) AJ PO ZMENE
 * opravneni — odvolat ju ex-post nie je mozne. Preto je TTL krátke.
 */
export async function getAttachmentDownloadUrl(
  attachmentId: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const notFound = { ok: false as const, message: "Priloha sa nenasla." };
  const failed = { ok: false as const, message: "Odkaz na stiahnutie sa nepodarilo vytvorit." };

  if (!isUuid(attachmentId)) return notFound;

  try {
    // 1) Autentifikacia + autorizacia (existujuci katalog opravneni).
    const auth = await requirePermission(PERMISSIONS.FINANCE_VIEW);
    if (!auth.ok) {
      const denied: AttachmentActionState = auth.state;
      return denied.ok ? failed : { ok: false, message: denied.message };
    }

    const supabase = await createClient();

    // 2) Nacitanie metadata cez RLS. Pouzivatel, ktory nema pristup k
    //    rodicovskej transakcii, riadok jednoducho neziska (IDOR).
    const target: {
      error: { message: string } | null;
      data: Pick<
        FinanceTransactionAttachmentRow,
        "id" | "transaction_id" | "storage_path"
      > | null;
    } = await (supabase as AnyDb)
      .from("finance_transaction_attachments")
      .select("id,transaction_id,storage_path")
      .eq("id", attachmentId)
      .single();
    if (target.error || !target.data) return notFound;

    const row = target.data as Pick<
      FinanceTransactionAttachmentRow,
      "id" | "transaction_id" | "storage_path"
    >;

    // 3) Ochrana pred manipulaciou s ulozenou cestou (path binding).
    if (!assertPathBinding(row.transaction_id, row.storage_path)) {
      return notFound;
    }

    // 4) Overenie existencie transakcie cez RLS (druha vrstva IDOR ochrany).
    const tx: { error: { message: string } | null; data: TxStatusRow | null } = await (
      supabase as AnyDb
    )
      .from("finance_transactions")
      .select("id,status")
      .eq("id", row.transaction_id)
      .single();
    if (tx.error || !tx.data) return notFound;

    // 5) Az TERAZ vydavame signed URL (300 s).
    const signed = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) return failed;

    // Token/signed URL zamerne nelogujeme.
    return { ok: true, url: signed.data.signedUrl };
  } catch (e) {
    // Zlyhanie po gate — nikdy neunesieme detail ani token do odpovede.
    const state: AttachmentActionState = failUnknown(e, failed.message, "download");
    if (state.ok) return failed;
    return { ok: false, message: state.message };
  }
}

