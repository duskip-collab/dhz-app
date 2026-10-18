/**
 * Member Courses Service
 * K15.2 — Server-side operations for member courses and qualifications
 * 
 * Handles:
 * - Fetching member courses
 * - Creating new course records
 * - Updating course details
 * - Deleting course records
 * - Tracking expiry dates
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermissionServer } from "@/lib/auth/server";
import type { MemberCourse, MemberCourseInput } from "@/types/member-courses.types";

// =============================================================================
// ERROR HANDLING
// =============================================================================

class CourseServiceError extends Error {
  constructor(
    public code: number,
    message: string
  ) {
    super(message);
    this.name = "CourseServiceError";
  }
}

function createCourseError(code: number, message: string): CourseServiceError {
  return new CourseServiceError(code, message);
}

// =============================================================================
// AUTHENTICATION & AUTHORIZATION
// =============================================================================

async function requireAuthenticated() {
  try {
    const ctx = await getAuthContext();
    return ctx;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unable to load authenticated user") || message.includes("Session expired") || message.includes("redirect")) {
      throw createCourseError(401, "Authentifikácia vyžadovaná");
    }
    throw error;
  }
}

// =============================================================================
// MAIN OPERATIONS
// =============================================================================

/**
 * getMemberCourses — Načítaj všetky kurzy pre člena
 * Autorizácia: MEMBERS_VIEW (čítanie oprávnené všetkým autentifikovaným)
 */
export async function getMemberCourses(
  memberId: string
): Promise<MemberCourse[]> {
  const ctx = await requireAuthenticated();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("member_courses")
    .select("*")
    .eq("member_id", memberId)
    .order("certification_date", { ascending: false });

  if (error) {
    console.error("[getMemberCourses] Supabase error:", error);
    throw createCourseError(500, "Chyba pri načítavaní kurzov");
  }

  return (data || []) as MemberCourse[];
}

/**
 * getExpiringCourses — Kurzy s expirujúcou platnosťou
 * Autorizácia: MEMBERS_VIEW
 */
export async function getExpiringCourses(
  daysAhead: number = 30
): Promise<MemberCourse[]> {
  const ctx = await requireAuthenticated();

  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];
  const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const { data, error } = await supabase
    .from("member_courses")
    .select("*")
    .gt("expiry_date", today)
    .lte("expiry_date", futureDate)
    .order("expiry_date", { ascending: true });

  if (error) {
    console.error("[getExpiringCourses] Supabase error:", error);
    throw createCourseError(500, "Chyba pri načítavaní expirujúcich kurzov");
  }

  return (data || []) as MemberCourse[];
}

/**
 * createMemberCourse — Vytvor nový záznam kurzu
 * Autorizácia: MEMBERS_EDIT (alebo ADMIN)
 */
export async function createMemberCourse(
  memberId: string,
  input: MemberCourseInput
): Promise<MemberCourse> {
  const ctx = await requireAuthenticated();

  // Authorization check — MEMBERS_EDIT
  const canEdit = await hasPermissionServer(
    ctx.userId,
    PERMISSIONS.MEMBERS_EDIT
  );
  if (!canEdit) {
    throw createCourseError(
      403,
      "Nemáte oprávnenie na pridanie kurzov členom"
    );
  }

  // Validation
  if (!input.course_name || input.course_name.trim() === "") {
    throw createCourseError(400, "Názov kurzu je povinný");
  }

  // Validate dates if provided
  if (input.certification_date && !isValidDate(input.certification_date)) {
    throw createCourseError(400, "Neplatný dátum certifikácie");
  }
  if (input.expiry_date && !isValidDate(input.expiry_date)) {
    throw createCourseError(400, "Neplatný dátum vypršania");
  }

  const supabase = await createClient();

  const payload = {
    member_id: memberId,
    course_name: input.course_name.trim(),
    certification_date: input.certification_date || null,
    expiry_date: input.expiry_date || null,
    issuing_authority: input.issuing_authority || null,
    certificate_number: input.certificate_number || null,
    notes: input.notes || null,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  };

  const { data, error } = await supabase
    .from("member_courses")
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error("[createMemberCourse] Supabase error:", error);
    if (error.code === "23505") {
      // UNIQUE constraint violation
      throw createCourseError(
        409,
        "Kurz s týmto názvom a dátumom už existuje"
      );
    }
    throw createCourseError(500, "Chyba pri vytváraní kurzu");
  }

  return data as MemberCourse;
}

/**
 * updateMemberCourse — Aktualizuj kurz
 * Autorizácia: MEMBERS_EDIT (alebo ADMIN)
 */
export async function updateMemberCourse(
  courseId: string,
  input: Partial<MemberCourseInput>
): Promise<MemberCourse> {
  const ctx = await requireAuthenticated();

  // Authorization check
  const canEdit = await hasPermissionServer(
    ctx.userId,
    PERMISSIONS.MEMBERS_EDIT
  );
  if (!canEdit) {
    throw createCourseError(403, "Nemáte oprávnenie na úpravu kurzov");
  }

  // Validate dates if updating
  if (input.certification_date && !isValidDate(input.certification_date)) {
    throw createCourseError(400, "Neplatný dátum certifikácie");
  }
  if (input.expiry_date && !isValidDate(input.expiry_date)) {
    throw createCourseError(400, "Neplatný dátum vypršania");
  }

  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = {};

  if (input.course_name !== undefined) {
    const name = input.course_name.trim();
    if (!name) {
      throw createCourseError(400, "Názov kurzu je povinný");
    }
    updatePayload.course_name = name;
  }

  if (input.certification_date !== undefined) {
    updatePayload.certification_date = input.certification_date;
  }
  if (input.expiry_date !== undefined) {
    updatePayload.expiry_date = input.expiry_date;
  }
  if (input.issuing_authority !== undefined) {
    updatePayload.issuing_authority = input.issuing_authority;
  }
  if (input.certificate_number !== undefined) {
    updatePayload.certificate_number = input.certificate_number;
  }
  if (input.notes !== undefined) {
    updatePayload.notes = input.notes;
  }

  updatePayload.updated_by = ctx.userId;
  updatePayload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("member_courses")
    .update(updatePayload as never)
    .eq("id", courseId)
    .select()
    .single();

  if (error) {
    console.error("[updateMemberCourse] Supabase error:", error);
    throw createCourseError(500, "Chyba pri aktualizácii kurzu");
  }

  return data as MemberCourse;
}

/**
 * deleteMemberCourse — Vymaž kurz
 * Autorizácia: MEMBERS_EDIT (oprávnení používatelia) alebo ADMIN
 */
export async function deleteMemberCourse(courseId: string): Promise<void> {
  const ctx = await requireAuthenticated();

  // Authorization check — MEMBERS_EDIT or ADMIN permission
  const canEdit = await hasPermissionServer(
    ctx.userId,
    PERMISSIONS.MEMBERS_EDIT
  );
  
  // Check if has admin-level delete - check if role is admin
  const isAdmin = ctx.roles && ctx.roles.some((r: any) => r === "ADMIN");
  
  if (!canEdit && !isAdmin) {
    throw createCourseError(403, "Iba admini alebo oprávnení používatelia môžu mazať kurzy");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("member_courses")
    .delete()
    .eq("id", courseId);

  if (error) {
    console.error("[deleteMemberCourse] Supabase error:", error);
    throw createCourseError(500, "Chyba pri mazaní kurzu");
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * isValidDate — Validuj ISO date string (YYYY-MM-DD)
 */
function isValidDate(dateStr: string): boolean {
  if (typeof dateStr !== "string") return false;

  // ISO format check
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRegex.test(dateStr)) return false;

  // Parse and validate
  const date = new Date(dateStr + "T00:00:00Z");
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * isExpiringSoon — Overaj, či je kurz expirujúci
 */
export function isExpiringSoon(
  course: MemberCourse,
  daysThreshold: number = 30
): boolean {
  if (!course.expiry_date) return false;

  const expiry = new Date(course.expiry_date);
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + daysThreshold);

  return expiry <= threshold;
}

/**
 * isExpired — Overaj, či je kurz už expirovaný
 */
export function isExpired(course: MemberCourse): boolean {
  if (!course.expiry_date) return false;

  const expiry = new Date(course.expiry_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return expiry < today;
}
