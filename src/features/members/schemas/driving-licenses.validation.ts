/**
 * Validation schema for Member Driving Licenses
 * Handles input validation and sanitization
 */

import type {
  MemberDrivingLicenseInput,
  DrivingLicenseFormErrors,
} from '@/types/member-driving-licenses.types';

/**
 * Check if a string is a valid ISO date (YYYY-MM-DD)
 */
function isValidISODate(value: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return !isNaN(date.getTime());
}

/**
 * Sanitize a string to prevent XSS (basic - remove scripts)
 */
function sanitizeString(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .trim()
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .slice(0, 1000);
}

/**
 * Validate member driving license input
 * @param input Raw input from form
 * @param isPartial true if this is a partial update (some fields optional)
 * @returns { valid: boolean, errors: DrivingLicenseFormErrors }
 */
export function validateDrivingLicenseInput(
  input: Partial<MemberDrivingLicenseInput>,
  isPartial: boolean = false,
): { valid: boolean; errors: DrivingLicenseFormErrors } {
  const errors: DrivingLicenseFormErrors = {};
  const root: string[] = [];

  // Category validation
  if (input.category !== undefined) {
    if (!input.category || input.category.trim().length === 0) {
      errors.category = 'Kategória je povinná';
    } else if (
      input.category.length > 10 ||
      !['A', 'B', 'C', 'D', 'AM', 'A1', 'A2', 'B1', 'C1', 'D1'].includes(
        input.category.trim().toUpperCase(),
      )
    ) {
      errors.category = 'Neplatná kategória vodičského preukazu';
    }
  } else if (!isPartial) {
    errors.category = 'Kategória je povinná';
  }

  // Issue date validation
  if (input.issue_date !== undefined) {
    if (!input.issue_date || input.issue_date.trim().length === 0) {
      errors.issue_date = 'Dátum vydania je povinný';
    } else if (!isValidISODate(input.issue_date.trim())) {
      errors.issue_date =
        'Neplatný formát dátumu (používaj YYYY-MM-DD)';
    } else {
      const issueDate = new Date(input.issue_date);
      if (issueDate > new Date()) {
        errors.issue_date = 'Dátum vydania nemôže byť v budúcnosti';
      }
    }
  } else if (!isPartial) {
    errors.issue_date = 'Dátum vydania je povinný';
  }

  // Expiry date validation (optional, but if provided must be valid)
  if (input.expiry_date !== undefined && input.expiry_date) {
    if (!isValidISODate(input.expiry_date.trim())) {
      errors.expiry_date = 'Neplatný formát dátumu (používaj YYYY-MM-DD)';
    } else {
      const expiryDate = new Date(input.expiry_date);
      // Allow past dates for historical records
      if (input.issue_date) {
        const issueDate = new Date(input.issue_date);
        if (expiryDate < issueDate) {
          errors.expiry_date =
            'Dátum expirácie nemôže byť skôr ako dátum vydania';
        }
      }
    }
  }

  // Country code validation
  if (input.country_code !== undefined) {
    if (!input.country_code || input.country_code.trim().length === 0) {
      errors.country_code = 'Krajina je povinná';
    } else {
      const code = input.country_code.trim().toUpperCase();
      if (code.length !== 2) {
        errors.country_code =
          'Krajina musí byť ISO 3166-1 kód (CZ, SK, DE, atď.)';
      }
      // Optional: Add validation against known country codes
      const validCountries = [
        'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
        'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT',
        'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'US', 'CA',
      ];
      if (!validCountries.includes(code)) {
        errors.country_code = `Krajina '${code}' nie je v podporovanom zozname`;
      }
    }
  } else if (!isPartial) {
    errors.country_code = 'Krajina je povinná';
  }

  // License number validation
  if (input.license_number !== undefined) {
    if (!input.license_number || input.license_number.trim().length === 0) {
      errors.license_number = 'Číslo preukazu je povinné';
    } else {
      const number = input.license_number.trim();
      if (number.length < 3 || number.length > 50) {
        errors.license_number =
          'Číslo preukazu musí mať 3-50 znakov';
      }
      // Simple validation: should contain alphanumeric chars and common separators
      if (!/^[A-Za-z0-9\s\-\/\.]+$/.test(number)) {
        errors.license_number =
          'Číslo preukazu obsahuje neplatné znaky';
      }
    }
  } else if (!isPartial) {
    errors.license_number = 'Číslo preukazu je povinné';
  }

  // Authority validation (optional)
  if (input.authority !== undefined && input.authority) {
    if (input.authority.length > 255) {
      errors.authority = 'Vydávajúca autorita je príliš dlhá (max 255 znakov)';
    }
  }

  // Notes validation (optional)
  if (input.notes !== undefined && input.notes) {
    if (input.notes.length > 1000) {
      errors.notes = 'Poznámky sú príliš dlhé (max 1000 znakov)';
    }
  }

  const valid = Object.keys(errors).length === 0;
  return { valid, errors: valid ? {} : errors };
}

/**
 * Sanitize driving license input to prevent XSS
 * @param input Raw input from form
 * @returns Sanitized input safe for database storage
 */
export function sanitizeDrivingLicenseInput(
  input: MemberDrivingLicenseInput,
): MemberDrivingLicenseInput {
  return {
    category: input.category?.trim().toUpperCase() || '',
    issue_date: input.issue_date?.trim() || '',
    expiry_date: input.expiry_date ? input.expiry_date.trim() : null,
    country_code: input.country_code?.trim().toUpperCase() || '',
    license_number: sanitizeString(input.license_number) || '',
    authority: sanitizeString(input.authority),
    notes: sanitizeString(input.notes),
  };
}

/**
 * Validate and sanitize in one step
 * @param input Raw input from form
 * @param isPartial true if this is a partial update
 * @returns { valid: boolean, errors, sanitized: MemberDrivingLicenseInput | null }
 */
export function validateAndSanitizeDrivingLicense(
  input: Partial<MemberDrivingLicenseInput>,
  isPartial: boolean = false,
): {
  valid: boolean;
  errors: DrivingLicenseFormErrors;
  sanitized: MemberDrivingLicenseInput | null;
} {
  const { valid, errors } = validateDrivingLicenseInput(input, isPartial);

  if (!valid) {
    return { valid: false, errors, sanitized: null };
  }

  const sanitized = sanitizeDrivingLicenseInput(
    input as MemberDrivingLicenseInput,
  );
  return { valid: true, errors: {}, sanitized };
}
