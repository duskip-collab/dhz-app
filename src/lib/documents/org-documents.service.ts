import { createClient } from "@/lib/supabase/server";
import { createAuthError } from "@/lib/members/members.errors";
import { requireAuthenticated } from "./org-documents.auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import {
  OrgDocument,
  OrgDocumentCategory,
  ORG_DOCUMENT_CATEGORY_LABELS,
  isOrgDocumentCategory,
} from "./org-documents.types";

const DOC_BUCKET = "org_documents";

export const MAX_DOC_BYTES = 25 * 1024 * 1024;

export const ALLOWED_DOC_TYPES = new Map<string, string[]>([
  ["application/pdf", [".pdf"]],
  ["application/msword", [".doc"]],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    [".docx"],
  ],
  ["application/vnd.ms-excel", [".xls"]],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    [".xlsx"],
  ],
]);



/**
 * listOrgDocuments – zoznam dokumentov zboru (voliteľne podľa kategórie).
 * Vyžaduje `documents.view`.
 */
export async function listOrgDocuments(category?: OrgDocumentCategory): Promise<OrgDocument[]> {
  const ctx = await requireAuthenticated();
  const allowed =
    ctx.permissions.includes(PERMISSIONS.DOCUMENTS_VIEW) ||
    (await hasPermissionServer(ctx.userId, PERMISSIONS.DOCUMENTS_VIEW));
  if (!allowed) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie dokumentov.");
  }

  const supabase = await createClient();
  let query = supabase
    .from("organization_documents")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    console.error("[listOrgDocuments] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní dokumentov.");
  }
  return (data ?? []) as OrgDocument[];
}

/**
 * uploadOrgDocument – nahratie súboru (PDF/Word/Excel) + metadáta.
 * Vyžaduje `documents.upload`.
 */
export async function uploadOrgDocument(input: {
  title: string;
  category: OrgDocumentCategory;
  description?: string | null;
  file: File;
}): Promise<OrgDocument> {
  const ctx = await requireAuthenticated();
  const allowed =
    ctx.permissions.includes(PERMISSIONS.DOCUMENTS_UPLOAD) ||
    (await hasPermissionServer(ctx.userId, PERMISSIONS.DOCUMENTS_UPLOAD));
  if (!allowed) {
    throw createAuthError(403, "Nemáte oprávnenie na nahrávanie dokumentov.");
  }

  const title = input.title.trim();
  if (!title) throw createAuthError(400, "Názov dokumentu je povinný.");

  const suffixes = ALLOWED_DOC_TYPES.get(input.file.type);
  const fileName = input.file.name.toLowerCase();
  if (!suffixes || !suffixes.some((s) => fileName.endsWith(s))) {
    throw createAuthError(400, "Podporované sú len PDF, Word (.doc, .docx) a Excel (.xls, .xlsx).");
  }
  if (input.file.size <= 0 || input.file.size > MAX_DOC_BYTES) {
    throw createAuthError(400, "Maximálna veľkosť súboru je 25 MB.");
  }

  const supabase = await createClient();
  const safeName = fileName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(-120);
  const year = new Date().getFullYear();
  const path = `${year}/${Date.now()}-${safeName}`;

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(path, bytes, {
    contentType: input.file.type,
    upsert: false,
  });
  if (upErr) {
    console.error("[uploadOrgDocument] storage error:", upErr);
    throw createAuthError(500, "Nahrávanie súboru zlyhalo.");
  }

  const { data, error } = await supabase
    .from("organization_documents")
    .insert({
      category: input.category,
      title,
      description: input.description?.trim() || null,
      file_name: input.file.name,
      storage_path: path,
      mime_type: input.file.type,
      size_bytes: input.file.size,
      uploaded_by: ctx.userId,
    } as never)
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(DOC_BUCKET).remove([path]);
    console.error("[uploadOrgDocument] insert error:", error);
    throw createAuthError(500, "Chyba pri ukladaní dokumentu.");
  }

  return data as OrgDocument;
}

/**
 * deleteOrgDocument – vymazanie dokumentu vrátane súboru.
 * Vyžaduje `documents.upload`.
 */
export async function deleteOrgDocument(documentId: string): Promise<{ id: string }> {
  const ctx = await requireAuthenticated();
  const allowed =
    ctx.permissions.includes(PERMISSIONS.DOCUMENTS_UPLOAD) ||
    (await hasPermissionServer(ctx.userId, PERMISSIONS.DOCUMENTS_UPLOAD));
  if (!allowed) {
    throw createAuthError(403, "Nemáte oprávnenie na mazanie dokumentov.");
  }

  const supabase = await createClient();

  const { data: existing, error: existError } = await supabase
    .from("organization_documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .single();
  if (existError || !existing) {
    throw createAuthError(404, "Dokument sa nenašiel.");
  }

  const row = existing as { id: string; storage_path: string };

  const { error } = await supabase.from("organization_documents").delete().eq("id", documentId);
  if (error) {
    console.error("[deleteOrgDocument] Supabase error:", error);
    throw createAuthError(500, "Chyba pri mazaní dokumentu.");
  }

  // odstránenie súboru (best-effort – riadok je už zmazaný)
  await supabase.storage.from(DOC_BUCKET).remove([row.storage_path]);

  return { id: documentId };
}

/**
 * getOrgDocumentUrl – podpísaná URL na stiahnutie/otvorenie súboru.
 * Vyžaduje `documents.view`.
 */
export async function getOrgDocumentUrl(documentId: string): Promise<string> {
  const ctx = await requireAuthenticated();
  const allowed =
    ctx.permissions.includes(PERMISSIONS.DOCUMENTS_VIEW) ||
    (await hasPermissionServer(ctx.userId, PERMISSIONS.DOCUMENTS_VIEW));
  if (!allowed) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie dokumentov.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_documents")
    .select("storage_path")
    .eq("id", documentId)
    .single();
  if (error || !data) throw createAuthError(404, "Dokument sa nenašiel.");

  const { data: signed, error: signError } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl((data as { storage_path: string }).storage_path, 60 * 10);
  if (signError || !signed?.signedUrl) {
    throw createAuthError(500, "Súbor sa nepodarilo sprístupniť.");
  }
  return signed.signedUrl;
}
