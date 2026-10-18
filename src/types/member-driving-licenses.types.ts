/**
 * Member Driving Licenses Types
 * Safe for client-side imports (no server dependencies)
 */

export interface MemberDrivingLicense {
  id: string;
  member_id: string;
  category: string;                  // A, B, C, D, AM, A1, A2, B1, C1, D1
  issue_date: string;                // YYYY-MM-DD
  expiry_date: string | null;        // YYYY-MM-DD or null
  country_code: string;              // ISO 3166-1 alpha-2 (CZ, SK, etc.)
  license_number: string;            // Unique identifier
  authority: string | null;          // Issuing authority
  notes: string | null;              // Additional notes
  created_at: string;                // ISO timestamp
  created_by: string | null;         // User ID
  updated_at: string;                // ISO timestamp
  updated_by: string | null;         // User ID
}

export interface MemberDrivingLicenseInput {
  category: string;
  issue_date: string;                // YYYY-MM-DD
  expiry_date?: string | null;       // YYYY-MM-DD (optional)
  country_code: string;
  license_number: string;
  authority?: string | null;
  notes?: string | null;
}

export interface DrivingLicenseFormErrors {
  category?: string;
  issue_date?: string;
  expiry_date?: string;
  country_code?: string;
  license_number?: string;
  authority?: string;
  notes?: string;
  root?: string[];
}

// Valid license categories (EU standard)
export const VALID_LICENSE_CATEGORIES = [
  'A',   // Motorcycles over 35kW
  'A1',  // Motorcycles up to 125cc
  'A2',  // Motorcycles up to 35kW
  'B',   // Cars up to 3500kg
  'B1',  // Tricycles
  'C',   // Trucks over 3500kg
  'C1',  // Trucks 3500-7500kg
  'D',   // Buses
  'D1',  // Minibuses
  'AM',  // Mopeds
] as const;

// Valid ISO 3166-1 alpha-2 country codes (common in EU + neighbors)
export const VALID_COUNTRY_CODES = [
  'AT', // Austria
  'BE', // Belgium
  'BG', // Bulgaria
  'HR', // Croatia
  'CY', // Cyprus
  'CZ', // Czech Republic
  'DK', // Denmark
  'EE', // Estonia
  'FI', // Finland
  'FR', // France
  'DE', // Germany
  'GR', // Greece
  'HU', // Hungary
  'IE', // Ireland
  'IT', // Italy
  'LV', // Latvia
  'LT', // Lithuania
  'LU', // Luxembourg
  'MT', // Malta
  'NL', // Netherlands
  'PL', // Poland
  'PT', // Portugal
  'RO', // Romania
  'SK', // Slovakia
  'SI', // Slovenia
  'ES', // Spain
  'SE', // Sweden
  'GB', // United Kingdom
  'US', // United States (for international)
  'CA', // Canada (for international)
] as const;

export type LicenseCategory = (typeof VALID_LICENSE_CATEGORIES)[number];
export type CountryCode = (typeof VALID_COUNTRY_CODES)[number];
