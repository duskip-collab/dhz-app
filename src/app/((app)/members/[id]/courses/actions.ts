// =============================================================================
// Server Action - Mazanie kurzov a certifikátu pre člena
// =============================================================================
// K29.0: deleteMemberCourseAction - vymaže kurz, súbor a reštualizuj AJAX

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/server";
import { requireCommitteeMember } from "@/lib/auth/committee";
import { createAuthError } from "@/lib/members/members.errors";
import { deleteMemberCourse } from "@/lib/members/member-courses.service";

export async function deleteMemberCourseAction(
  formData: FormData
): Promise<void> {
  const memberId = formData.get("member_id") as string;
  const courseId = formData.get("course_id") as string;

  if (!memberId || !courseId) {
    throw createAuthError(400, "Chýba parameter id kurzu alebo člena.");
  }

  // Zero-Trust: overenie oprávnení na serveri
  const ctx = await getAuthContext();
  
  // Overíme, či je používateľ výborom (admin/adminiusotky)
  await requireCommitteeMember();

  const supabase = await createClient();

  // 1. Načítaj záznam z member_courses pre získanie cesty k súboru certifikátu
  const { data: courseRecord, error: fetchError } = await supabase
    .from("member_courses")
    .select("certificate_file_path")
    .eq("id", courseId)
    .eq("member_id", memberId)
    .single();

  if (fetchError) {
    console.error("[deleteMemberCourseAction] Error fetching course:", fetchError);
    throw createAuthError(500, "Chyba pri načítavaní údajov kurzu.");
  }

  // 2. Pokúsi sa odstrániť aj fyzický súbor s certifikátom zo Storage
  if (courseRecord?.certificate_file_path) {
    try {
      const { error: storageError } = await supabase.storage
        .from("certificates")
        .remove([courseRecord.certificate_file_path]);

      if (storageError) {
        console.error("[deleteMemberCourseAction] Storage delete error:", storageError);
        // Storage chyba neprerušuje hlavný tok - pokračuje sa v delete z DB
      }
    } catch (storageError) {
      console.error("[deleteMemberCourseAction] Storage delete exception:", storageError);
    }
  }

  // 3. Vymaž záznam z tabuľky member_courses
  await deleteMemberCourse(courseId);

  // 4. Reštualizuj URL (next cache)
  revalidatePath(`/members/${memberId}`);
  revalidatePath(`/members`);

  // 5. Presmerovanie na detail člena
  redirect(`/members/${memberId}`);
}
