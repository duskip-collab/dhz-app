/**
 * Member Courses Validation Schema
 * K15.2 — Input validation for course creation and updates
 */

export interface MemberCourseInput {
  course_name: string;
  certification_date?: string | null;
  expiry_date?: string | null;
  issuing_authority?: string | null;
  certificate_number?: string | null;
  notes?: string | null;
}

export interface MemberCourseValidationError {
  field: string;
  message: string;
}

/**
 * validateMemberCourseInput — Kompletná validácia vstupu
 */
export function validateMemberCourseInput(
  data: unknown
): { valid: boolean; errors: MemberCourseValidationError[] } {
  const errors: MemberCourseValidationError[] = [];

  if (!data || typeof data !== "object") {
    errors.push({
      field: "root",
      message: "Údaje musia byť objekt",
    });
    return { valid: false, errors };
  }

  const input = data as Record<string, unknown>;

  // course_name — povinné, neprázdny reťazec
  if (!input.course_name || typeof input.course_name !== "string") {
    errors.push({
      field: "course_name",
      message: "Názov kurzu je povinný",
    });
  } else if (input.course_name.trim().length === 0) {
    errors.push({
      field: "course_name",
      message: "Názov kurzu nemôže byť prázdny",
    });
  } else if (input.course_name.trim().length > 500) {
    errors.push({
      field: "course_name",
      message: "Názov kurzu je príliš dlhý (max 500 znakov)",
    });
  }

  // certification_date — voliteľné, ale ak je, musí byť ISO date
  if (
    input.certification_date !== undefined &&
    input.certification_date !== null
  ) {
    if (typeof input.certification_date !== "string") {
      errors.push({
        field: "certification_date",
        message: "Dátum certifikácie musí byť reťazec (ISO format)",
      });
    } else if (!isValidISODate(input.certification_date)) {
      errors.push({
        field: "certification_date",
        message: "Neplatný dátum certifikácie (použite formát YYYY-MM-DD)",
      });
    }
  }

  // expiry_date — voliteľné, ale ak je, musí byť ISO date
  if (input.expiry_date !== undefined && input.expiry_date !== null) {
    if (typeof input.expiry_date !== "string") {
      errors.push({
        field: "expiry_date",
        message: "Dátum vypršania musí byť reťazec (ISO format)",
      });
    } else if (!isValidISODate(input.expiry_date)) {
      errors.push({
        field: "expiry_date",
        message: "Neplatný dátum vypršania (použite formát YYYY-MM-DD)",
      });
    }
  }

  // issuing_authority — voliteľné, ale ak je, max 300 znakov
  if (input.issuing_authority !== undefined && input.issuing_authority !== null) {
    if (typeof input.issuing_authority !== "string") {
      errors.push({
        field: "issuing_authority",
        message: "Vydavateľská inštitúcia musí byť reťazec",
      });
    } else if (input.issuing_authority.trim().length > 300) {
      errors.push({
        field: "issuing_authority",
        message: "Vydavateľská inštitúcia je príliš dlhá (max 300 znakov)",
      });
    }
  }

  // certificate_number — voliteľné, ale ak je, max 100 znakov
  if (input.certificate_number !== undefined && input.certificate_number !== null) {
    if (typeof input.certificate_number !== "string") {
      errors.push({
        field: "certificate_number",
        message: "Číslo certifikátu musí byť reťazec",
      });
    } else if (input.certificate_number.trim().length > 100) {
      errors.push({
        field: "certificate_number",
        message: "Číslo certifikátu je príliš dlhé (max 100 znakov)",
      });
    }
  }

  // notes — voliteľné, ale ak je, max 1000 znakov
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== "string") {
      errors.push({
        field: "notes",
        message: "Poznámky musia byť reťazec",
      });
    } else if (input.notes.trim().length > 1000) {
      errors.push({
        field: "notes",
        message: "Poznámky sú príliš dlhé (max 1000 znakov)",
      });
    }
  }

  // Semantic validation: expiry_date >= certification_date
  if (
    input.certification_date &&
    input.expiry_date &&
    typeof input.certification_date === "string" &&
    typeof input.expiry_date === "string"
  ) {
    const certDate = new Date(input.certification_date);
    const expiryDate = new Date(input.expiry_date);

    if (certDate > expiryDate) {
      errors.push({
        field: "expiry_date",
        message: "Dátum vypršania musí byť po dátume certifikácie",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * isValidISODate — Validuj YYYY-MM-DD format
 */
function isValidISODate(dateStr: string): boolean {
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRegex.test(dateStr)) return false;

  const date = new Date(dateStr + "T00:00:00Z");
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * sanitizeMemberCourseInput — Vyčisti vstup
 */
export function sanitizeMemberCourseInput(
  data: unknown
): MemberCourseInput | null {
  if (!data || typeof data !== "object") return null;

  const input = data as Record<string, unknown>;

  return {
    course_name:
      typeof input.course_name === "string"
        ? input.course_name.trim()
        : "",
    certification_date:
      input.certification_date === null ||
      input.certification_date === undefined
        ? null
        : typeof input.certification_date === "string"
          ? input.certification_date.trim()
          : null,
    expiry_date:
      input.expiry_date === null || input.expiry_date === undefined
        ? null
        : typeof input.expiry_date === "string"
          ? input.expiry_date.trim()
          : null,
    issuing_authority:
      input.issuing_authority === null ||
      input.issuing_authority === undefined
        ? null
        : typeof input.issuing_authority === "string"
          ? input.issuing_authority.trim()
          : null,
    certificate_number:
      input.certificate_number === null ||
      input.certificate_number === undefined
        ? null
        : typeof input.certificate_number === "string"
          ? input.certificate_number.trim()
          : null,
    notes:
      input.notes === null || input.notes === undefined
        ? null
        : typeof input.notes === "string"
          ? input.notes.trim()
          : null,
  };
}
