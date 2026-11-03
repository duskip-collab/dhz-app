// Member Profile Service - Aggregation & Detailed Profile Data
// K15.1 – Member Profile Implementation
//
// Bezpečné server-side načítanie kompletného profilu člena vrátane:
// - základné údaje (member)
// - opatrovníci (guardians)
// - pridelená výstroj (gear assignments)
// - tréning a dochádzka (training attendance)
// - súťaže (competition lineups)
// - budúce: kurzy, vodičské oprávnenia, dokumenty

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { checkPermission, checkPermissionServer } from "./members.service";
import { createAuthError } from "./members.errors";
import type { Member, MemberGuardian } from "./members.service";
import type { MemberCourse } from "@/types/member-courses.types";
import type { MemberDrivingLicense } from "@/types/member-driving-licenses.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// TYPY – PROFIL ČLENA
// =============================================================================

export interface GearAssignment {
  id: string;
  member_id: string;
  equipment_id: string;
  assigned_at: string;
  returned_at: string | null;
  notes: string | null;
  condition_on_assign: string | null;
  condition_on_return: string | null;
  equipment: {
    id: string;
    name: string;
    inventory_number: string | null;
    location: string | null;
    status: string | null;
    condition: string | null;
    category: string | null;
  };
}

export interface TrainingAttendance {
  id: string;
  training_id: string;
  member_id: string;
  status: "PRESENT" | "ABSENT" | "EXCUSED" | "LATE";
  note: string | null;
  created_at: string;
  training: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    location: string | null;
  };
}

export interface CompetitionLineup {
  id: string;
  team_id: string;
  member_id: string;
  created_at: string;
  team: {
    id: string;
    name: string;
    competition_id: string;
    result_time: number | null;
    result_points: number | null;
    rank: number | null;
    competition: {
      id: string;
      title: string;
      location: string | null;
      date: string;
      category: string;
    };
  };
}

/**
 * Kompletný profil člena so všetkými sekciami
 */
export interface MemberProfile {
  member: Member;
  guardians: MemberGuardian[];
  gear: GearAssignment[];
  training: TrainingAttendance[];
  competitions: CompetitionLineup[];
  courses: MemberCourse[];
  driving_licenses: MemberDrivingLicense[];
}

// =============================================================================
// NAČÍTANIE PROFILU – AGREGÁCIA VŠETKÝCH DÁT
// =============================================================================

/**
 * getMemberProfile – Načíta kompletný profil člena vrátane všetkých sekcií.
 * Vyžaduje permission members.view.
 * 
 * Vracia agregovanú štruktúru s:
 * - základné údaje člena
 * - opatrovníci
 * - pridelená výstroj (active + archivovaná)
 * - tréningy a dochádzka
 * - súťaže a lineups
 * - kurzy a certifikácie
 * 
 * @param memberId UUID člena
 * @throws {Error} 401 ak nie je prihlásený, 403 ak nemá oprávnenie, 404 ak člen neexistuje
 */
export async function getMemberProfile(memberId: string): Promise<MemberProfile> {
  const ctx = await getAuthContext();

  // Permission check: members.view
  const hasView =
    checkPermission(ctx, PERMISSIONS.MEMBERS_VIEW) ||
    (await checkPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_VIEW));

  if (!hasView) {
    throw createAuthError(403, "Nemáte oprávnenie na zobrazenie profilu člena.");
  }

  const supabase = await createClient();

  // Paralelné načítanie všetkých sekcií
  const [member, guardians, gear, training, competitions, courses, driving_licenses] = await Promise.all([
    fetchMemberBasic(supabase, memberId),
    fetchMemberGuardians(supabase, memberId),
    fetchMemberGear(supabase, memberId),
    fetchMemberTraining(supabase, memberId),
    fetchMemberCompetitions(supabase, memberId),
    fetchMemberCourses(supabase, memberId),
    fetchMemberDrivingLicenses(supabase, memberId),
  ]);

  return {
    member,
    guardians,
    gear,
    training,
    competitions,
    courses,
    driving_licenses,
  };
}

// =============================================================================
// SÚKROMNÉ FUNKCIE – NAČÍTANIE JEDNOTLIVÝCH SEKCIÍ
// =============================================================================

/**
 * fetchMemberBasic – Základné údaje člena
 */
async function fetchMemberBasic(
  supabase: SupabaseClient,
  memberId: string
): Promise<Member> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", memberId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw createAuthError(404, "Člen neexistuje.");
    }
    console.error("[fetchMemberBasic]", error);
    throw createAuthError(500, "Chyba pri načítavaní údajov člena.");
  }

  return data as unknown as Member;
}

/**
 * fetchMemberGuardians – Opatrovníci člena
 */
async function fetchMemberGuardians(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberGuardian[]> {
  const { data, error } = await supabase
    .from("member_guardians")
    .select("*")
    .eq("member_id", memberId)
    .order("is_primary_contact", { ascending: false });

  if (error) {
    console.error("[fetchMemberGuardians]", error);
    return []; // Ak chyba, vrátim prázdny zoznam
  }

  return (data || []) as unknown as MemberGuardian[];
}

/**
 * fetchMemberGear – Pridelená výstroj člena
 * Vracia aktívne aj vrátené pridelenia (returned_at je null = aktívne)
 */
async function fetchMemberGear(
  supabase: SupabaseClient,
  memberId: string
): Promise<GearAssignment[]> {
  const { data, error } = await supabase
    .from("equipment_assignments")
    .select(
      `
      id,
      member_id,
      equipment_id,
      assigned_at,
      returned_at,
      notes,
      condition_on_assign,
      condition_on_return,
      equipment:equipment_items!equipment_assignments_equipment_id_fkey(
        id,
        name,
        inventory_number,
        location,
        status,
        condition,
        category:equipment_categories!equipment_items_category_id_fkey(name)
      )
      `
    )
    .eq("member_id", memberId)
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("[fetchMemberGear]", error);
    return [];
  }

  return (data || []) as unknown as GearAssignment[];
}

/**
 * fetchMemberTraining – Tréningy a dochádzka člena
 */
async function fetchMemberTraining(
  supabase: SupabaseClient,
  memberId: string
): Promise<TrainingAttendance[]> {
  const { data, error } = await supabase
    .from("training_attendance")
    .select(
      `
      id,
      training_id,
      member_id,
      status,
      note,
      created_at,
      training:trainings!training_attendance_training_id_fkey(
        id,
        title,
        start_time,
        end_time,
        location
      )
      `
    )
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(50); // Limituj na posledných 50 záznamov

  if (error) {
    console.error("[fetchMemberTraining]", error);
    return [];
  }

  return (data || []) as unknown as TrainingAttendance[];
}

/**
 * fetchMemberCompetitions – Súťaže a lineups člena
 */
async function fetchMemberCompetitions(
  supabase: SupabaseClient,
  memberId: string
): Promise<CompetitionLineup[]> {
  const { data, error } = await supabase
    .from("competition_lineups")
    .select(
      `
      id,
      team_id,
      member_id,
      created_at,
      team:competition_teams!competition_lineups_team_id_fkey(
        id,
        name,
        competition_id,
        result_time,
        result_points,
        rank,
        competition:competitions!competition_teams_competition_id_fkey(
          id,
          title,
          location,
          date,
          category
        )
      )
      `
    )
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(50); // Limituj na posledných 50 záznamov

  if (error) {
    console.error("[fetchMemberCompetitions]", error);
    return [];
  }

  return (data || []) as unknown as CompetitionLineup[];
}

/**
 * fetchMemberCourses – Kurzy a certifikácie člena
 */
async function fetchMemberCourses(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberCourse[]> {
  const { data, error } = await supabase
    .from("member_courses")
    .select("*")
    .eq("member_id", memberId)
    .order("certification_date", { ascending: false });

  if (error) {
    console.error("[fetchMemberCourses]", error);
    return [];
  }

  return (data || []) as unknown as MemberCourse[];
}

/**
 * fetchMemberDrivingLicenses – Vodičské preukazy člena
 */
async function fetchMemberDrivingLicenses(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberDrivingLicense[]> {
  const { data, error } = await supabase
    .from("member_driving_licenses")
    .select("*")
    .eq("member_id", memberId)
    .order("category", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[fetchMemberDrivingLicenses]", error);
    return [];
  }

  return (data || []) as unknown as MemberDrivingLicense[];
}

// =============================================================================
// ŠTATISTIKY – AGREGÁCIA ZISKOV
// ============================================================================= 

export interface MemberProfileStats {
  totalGearAssigned: number;
  activeGearCount: number;
  totalTrainingAttendances: number;
  presentCount: number;
  absentCount: number;
  excusedCount: number;
  lateCount: number;
  totalCompetitions: number;
}

/**
 * getMemberProfileStats – Počítadlá a štatistiky profilu
 */
export function getMemberProfileStats(profile: MemberProfile): MemberProfileStats {
  return {
    totalGearAssigned: profile.gear.length,
    activeGearCount: profile.gear.filter((g) => !g.returned_at).length,
    totalTrainingAttendances: profile.training.length,
    presentCount: profile.training.filter((t) => t.status === "PRESENT").length,
    absentCount: profile.training.filter((t) => t.status === "ABSENT").length,
    excusedCount: profile.training.filter((t) => t.status === "EXCUSED").length,
    lateCount: profile.training.filter((t) => t.status === "LATE").length,
    totalCompetitions: new Set(profile.competitions.map((c) => c.team.competition_id)).size,
  };
}
