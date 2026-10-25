import { FileText, NotebookPen } from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  listOrgDocuments,
  getOrgDocumentUrl,
} from "@/lib/documents/org-documents.service";
import { type OrgDocument } from "@/lib/documents/org-documents.types";
import { DocumentUploadForm } from "@/features/documents/components/DocumentUploadForm";
import { DocumentList } from "@/features/documents/components/DocumentList";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.DOCUMENTS_VIEW);
  const canUpload = hasPermission(ctx.permissions, PERMISSIONS.DOCUMENTS_UPLOAD);
  const sp = (await searchParams) ?? {};
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;

  let documents: OrgDocument[] = [];
  try {
    documents = await listOrgDocuments();
  } catch {
    documents = [];
  }

  // podpísané URL na stiahnutie (server-side, 10 min platnosť)
  const downloadUrls: Record<string, string> = {};
  await Promise.all(
    documents.map(async (doc) => {
      try {
        downloadUrls[doc.id] = await getOrgDocumentUrl(doc.id);
      } catch {
        // bez URL – položka sa zobrazí bez tlačidla Otvoriť
      }
    })
  );

  const minutes = documents.filter((d) => d.category === "MINUTES");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-[#C62828]" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dokumenty</h1>
          <p className="text-sm text-gray-500">
            Zápisnice z porád a dokumentácia zboru (Word, Excel, PDF).
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-[#C62828]">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* ZÁPISNICE Z PORÁD */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <NotebookPen className="h-5 w-5 text-[#C62828]" />
          <div>
            <h2 className="text-base font-bold text-gray-900">Zápisnice z porád</h2>
            <p className="text-xs text-gray-500">
              {minutes.length === 0 ? "Zatiaľ žiadne zápisnice." : `${minutes.length} dokumentov`}
            </p>
          </div>
        </div>
        <div className="p-5">
          <DocumentList
            documents={minutes}
            downloadUrls={downloadUrls}
            canUpload={canUpload}
          />
        </div>
      </section>

      {/* OSTATNÉ DOKUMENTY */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">Ostatné dokumenty</h2>
          <p className="text-xs text-gray-500">Štatúty, správy, finančné dokumenty a ďalšie.</p>
        </div>
        <div className="px-5 pb-5">
          <DocumentList
            documents={documents.filter((d) => d.category !== "MINUTES")}
            downloadUrls={downloadUrls}
            canUpload={canUpload}
          />
        </div>
      </section>

      {/* NAHRÁVANIE */}
      {canUpload ? (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4">
            <h2 className="text-base font-bold text-gray-900">Pridať dokument</h2>
            <p className="text-xs text-gray-500">
              Nahrajte zápisnicu alebo iný dokument (Word, Excel, PDF, max. 25 MB).
            </p>
          </div>
          <div className="px-5 pb-5">
            <DocumentUploadForm defaultCategory="MINUTES" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
