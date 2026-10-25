export type OrgDocumentCategory = "MINUTES" | "STATUTE" | "REPORT" | "FINANCE" | "OTHER";

export const ORG_DOCUMENT_CATEGORY_LABELS: Record<OrgDocumentCategory, string> = {
  MINUTES: "Zápisnica z porady",
  STATUTE: "Štatút / smernica",
  REPORT: "Správa / výkaz",
  FINANCE: "Finančný dokument",
  OTHER: "Ostatné",
};

export interface OrgDocument {
  id: string;
  category: OrgDocumentCategory;
  title: string;
  description: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORY_VALUES: OrgDocumentCategory[] = [
  "MINUTES",
  "STATUTE",
  "REPORT",
  "FINANCE",
  "OTHER",
];

export function isOrgDocumentCategory(v: string): v is OrgDocumentCategory {
  return (CATEGORY_VALUES as string[]).includes(v);
}