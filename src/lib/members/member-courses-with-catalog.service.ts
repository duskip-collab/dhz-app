// =============================================================================
// K29.0: Kurzy a odborná spôsobilosť – Sekcia v profile detailom člena
// =============================================================================

"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import { createAuthError } from "@/lib/members/members.errors";
import { getMemberCourses } from "@/lib/members/member-courses.service";
import { getCourseCatalog } from "@/lib/members/course-catalog.service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// =============================================================================
// Typy
// =============================================================================

export interface MemberCourseWithCatalog {
  id: string;
  course_name: string;
  certification_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  certificate_number: string | null;
  notes: string | null;
  certificate_file_path: string | null;
  course_catalog: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    issuing_authority: string | null;
  } | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

// =============================================================================
// Server Action: getMemberCoursesWithCatalog
// =============================================================================

export async function getMemberCoursesWithCatalog(memberId: string): Promise<MemberCourseWithCatalog[]> {
  const ctx = await getAuthContext();
  await requirePermission(ctx);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("member_courses")
    .select(`
      *,
      course_catalog: course_catalog_id!inner (
        id,
        code,
        name,
        description,
        issuing_authority
      )
    `)
    .eq("member_id", memberId)
    .order("certification_date", { ascending: false });

  if (error) {
    console.error("[getMemberCoursesWithCatalog] Supabase error:", error);
    throw createAuthError(500, "Chyba pri načítavaní kurzov.");
  }

  return (data || []) as MemberCourseWithCatalog[];
}

// =============================================================================
// Pomocné funkcie
// =============================================================================

async function requirePermission(ctx: any) {
  if (!ctx.memberId) {
    throw createAuthError(401, "Nie ste prihlásený");
  }

  const canView = await hasPermissionServer(PERMISSIONS.MEMBERS_VIEW);
  if (!canView) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie kurzov.");
  }
}

// =============================================================================
// Re-export pre použitie v UI
// =============================================================================

export { revalidatePath };
