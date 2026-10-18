/**
 * Member Courses Type Definitions
 * Shared types for client and server code
 * NOTE: This file must NOT import any server-side utilities
 */

export interface MemberCourse {
  id: string;
  member_id: string;
  course_name: string;
  certification_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  certificate_number: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface MemberCourseInput {
  course_name: string;
  certification_date?: string | null;
  expiry_date?: string | null;
  issuing_authority?: string | null;
  certificate_number?: string | null;
  notes?: string | null;
}
