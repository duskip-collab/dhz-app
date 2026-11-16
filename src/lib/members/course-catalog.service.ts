import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermissionServer } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createAuthError } from "@/lib/members/members.errors";

const CourseCatalogEntrySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  issuing_authority: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type CourseCatalogEntry = z.infer<typeof CourseCatalogEntrySchema>;

export async function getCourseCatalog(): Promise<CourseCatalogEntry[]> {
  const ctx = await getAuthContext();
  if (!ctx.memberId) {
    throw createAuthError(401, "Prihlásenie je potrebné na zobrazenie katalógu kurzov.");
  }

  const canView =
    ctx.permissions.includes(PERMISSIONS.MEMBERS_VIEW) ||
    (await hasPermissionServer(PERMISSIONS.MEMBERS_VIEW));
  if (!canView) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie katalógu kurzov.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_catalog")
    .select("id, code, name, description, issuing_authority, created_at, updated_at")
    .order("name", { ascending: true });

  if (error) {
    console.error("[getCourseCatalog] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní katalógu kurzov.");
  }

  const parsed = CourseCatalogEntrySchema.array().safeParse(data ?? []);
  if (!parsed.success) {
    console.error("[getCourseCatalog] Invalid database response:", parsed.error.issues);
    throw createAuthError(500, "Katalóg kurzov obsahuje neplatné údaje.");
  }

  return parsed.data;
}
