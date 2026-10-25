"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  uploadOrgDocument,
  deleteOrgDocument,
} from "@/lib/documents/org-documents.service";
import {
  isOrgDocumentCategory,
  type OrgDocumentCategory,
} from "@/lib/documents/org-documents.types";

export type OrgDocumentActionState =
  | { ok: true; documentId?: string }
  | { ok: false; errors: Record<string, string>; message: string };

function fail(message: string, errors: Record<string, string> = {}): OrgDocumentActionState {
  return { ok: false, errors, message };
}

function statusMessage(e: unknown, fallback: string): string {
  const status = (e as { statusCode?: number }).statusCode ?? 500;
  if (status === 403) return "Nemáte oprávnenie.";
  if (status === 404) return "Dokument sa nenašiel.";
  if (status === 400) return e instanceof Error ? e.message : "Neplatné údaje.";
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * uploadOrgDocumentAction – upload dokumentu cez useActionState.
 * Vyžaduje documents.upload.
 */
export async function uploadOrgDocumentAction(
  _prev: OrgDocumentActionState | null,
  formData: FormData
): Promise<OrgDocumentActionState> {
  const title = String(formData.get("title") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "");
  const description = String(formData.get("description") ?? "");
  const file = formData.get("file");

  if (!title) return fail("Názov dokumentu je povinný.", { title: "Názov dokumentu je povinný." });
  if (!isOrgDocumentCategory(categoryRaw)) {
    return fail("Neplatná kategória dokumentu.", { category: "Neplatná kategória." });
  }
  if (!(file instanceof File) || file.size === 0) {
    return fail("Vyberte súbor.", { file: "Vyberte súbor." });
  }

  try {
    const doc = await uploadOrgDocument({
      title,
      category: categoryRaw as OrgDocumentCategory,
      description: description || null,
      file,
    });
    revalidatePath("/documents");
    return { ok: true, documentId: doc.id };
  } catch (e) {
    return fail(statusMessage(e, "Chyba pri nahrávaní dokumentu."));
  }
}

/**
 * deleteOrgDocumentAction – form action (redirect pattern).
 * Vyžaduje documents.upload.
 */
export async function deleteOrgDocumentAction(formData: FormData): Promise<void> {
  const documentId = String(formData.get("document_id") ?? "");
  if (!documentId) {
    const params = new URLSearchParams({ error: "Chýba identifikátor dokumentu." });
    redirect(`/documents?${params.toString()}`);
  }

  try {
    await deleteOrgDocument(documentId);
    revalidatePath("/documents");
    const params = new URLSearchParams({ success: "Dokument bol odstránený." });
    redirect(`/documents?${params.toString()}`);
  } catch (e) {
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    const params = new URLSearchParams({ error: statusMessage(e, "Chyba pri mazaní dokumentu.") });
    redirect(`/documents?${params.toString()}`);
  }
}
