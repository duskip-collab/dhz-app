/**
 * Member Driving Licenses Service
 * Server-side operations for driver's licenses
 * Uses Supabase client with authentication context
 */

import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/auth/server';
import { hasPermissionServer } from '@/lib/auth/server';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { validateDrivingLicenseInput } from '@/features/members/schemas/driving-licenses.validation';
import type {
  MemberDrivingLicense,
  MemberDrivingLicenseInput,
} from '@/types/member-driving-licenses.types';

/**
 * Custom error class for driving license operations
 */
export class DrivingLicenseServiceError extends Error {
  constructor(
    message: string,
    public code: number,
  ) {
    super(message);
    this.name = 'DrivingLicenseServiceError';
  }
}

/**
 * Get Supabase client for server-side operations
 *
 * Používa štandardného serverového klienta (anon kľúč + session z cookies),
 * takže RLS politiky sa aplikujú na aktuálne prihláseného používateľa a nie je
 * potrebný SUPABASE_SERVICE_ROLE_KEY v .env.local.
 */
async function getSupabaseClient() {
  return createClient();
}

/**
 * Ensure user is authenticated
 * Throws 401 if authentication context cannot be established
 */
async function requireAuthenticated() {
  try {
    const ctx = await getAuthContext();
    if (!ctx.userId) {
      throw new DrivingLicenseServiceError('Authentifikácia zlyhal', 401);
    }
    return ctx;
  } catch (error) {
    if (error instanceof DrivingLicenseServiceError) throw error;
    throw new DrivingLicenseServiceError('Authentifikácia zlyhal', 401);
  }
}

/**
 * Get all driving licenses for a member
 * @param memberId UUID of the member
 * @returns Array of driving licenses (max 50)
 */
export async function getMemberDrivingLicenses(
  memberId: string,
): Promise<MemberDrivingLicense[]> {
  await requireAuthenticated();

  const client = await getSupabaseClient();

  const { data, error } = await client
    .from('member_driving_licenses')
    .select('*')
    .eq('member_id', memberId)
    .order('category', { ascending: true })
    .order('country_code', { ascending: true })
    .limit(50);

  if (error) {
    throw new DrivingLicenseServiceError(
      `Chyba pri načítaní vodičských preukazov: ${error.message}`,
      500,
    );
  }

  return (data || []) as MemberDrivingLicense[];
}

/**
 * Get driving licenses expiring within N days
 * @param memberId UUID of the member
 * @param days Number of days to check (default 30)
 * @returns Array of expiring licenses
 */
export async function getExpiringDrivingLicenses(
  memberId: string,
  days: number = 30,
): Promise<MemberDrivingLicense[]> {
  await requireAuthenticated();

  const client = await getSupabaseClient();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + days);

  const { data, error } = await client
    .from('member_driving_licenses')
    .select('*')
    .eq('member_id', memberId)
    .not('expiry_date', 'is', null)
    .gte('expiry_date', new Date().toISOString().split('T')[0]) // Not already expired
    .lte('expiry_date', cutoffDate.toISOString().split('T')[0]) // Expiring within N days
    .order('expiry_date', { ascending: true })
    .limit(50);

  if (error) {
    throw new DrivingLicenseServiceError(
      `Chyba pri načítaní vodičských preukazov: ${error.message}`,
      500,
    );
  }

  return (data || []) as MemberDrivingLicense[];
}

/**
 * Create a new driving license record
 * @param memberId UUID of the member
 * @param input Validated license input
 * @returns Created license object
 */
export async function createDrivingLicense(
  memberId: string,
  input: MemberDrivingLicenseInput,
): Promise<MemberDrivingLicense> {
  const ctx = await requireAuthenticated();

  // Validate input
  const { valid, errors } = validateDrivingLicenseInput(input);
  if (!valid) {
    throw new DrivingLicenseServiceError(
      `Validácia zlyhal: ${Object.values(errors).join(', ')}`,
      400,
    );
  }

  // Check permissions - use hasPermissionServer
  const canEdit = await hasPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_EDIT);
  if (!canEdit) {
    throw new DrivingLicenseServiceError(
      'Nemáš oprávnenie na vytvorenie vodičského preukazu',
      403,
    );
  }

  const client = await getSupabaseClient();

  const { data, error } = await client
    .from('member_driving_licenses')
    .insert({
      member_id: memberId,
      category: input.category,
      issue_date: input.issue_date,
      expiry_date: input.expiry_date || null,
      country_code: input.country_code,
      license_number: input.license_number,
      authority: input.authority || null,
      notes: input.notes || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('unique')) {
      throw new DrivingLicenseServiceError(
        `Preukazové číslo alebo kombinácia kategória + krajina už existuje`,
        409,
      );
    }
    throw new DrivingLicenseServiceError(
      `Chyba pri vytvorení vodičského preukazu: ${error.message}`,
      500,
    );
  }

  return data as MemberDrivingLicense;
}

/**
 * Update an existing driving license record
 * @param licenseId UUID of the license
 * @param input Partial input (only fields to update)
 * @returns Updated license object
 */
export async function updateDrivingLicense(
  licenseId: string,
  input: Partial<MemberDrivingLicenseInput>,
): Promise<MemberDrivingLicense> {
  const ctx = await requireAuthenticated();

  // Check permissions - use hasPermissionServer
  const canEdit = await hasPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_EDIT);
  if (!canEdit) {
    throw new DrivingLicenseServiceError(
      'Nemáš oprávnenie na úpravu vodičského preukazu',
      403,
    );
  }

  // Validate partial input if provided
  if (Object.keys(input).length > 0) {
    const { valid, errors } = validateDrivingLicenseInput(
      input as MemberDrivingLicenseInput,
      true,
    );
    if (!valid) {
      throw new DrivingLicenseServiceError(
        `Validácia zlyhal: ${Object.values(errors).join(', ')}`,
        400,
      );
    }
  }

  const client = await getSupabaseClient();

  const updateData: Partial<MemberDrivingLicense> = {
    updated_by: ctx.userId,
  };

  if (input.category !== undefined) updateData.category = input.category;
  if (input.issue_date !== undefined) updateData.issue_date = input.issue_date;
  if (input.expiry_date !== undefined)
    updateData.expiry_date = input.expiry_date || null;
  if (input.country_code !== undefined)
    updateData.country_code = input.country_code;
  if (input.license_number !== undefined)
    updateData.license_number = input.license_number;
  if (input.authority !== undefined)
    updateData.authority = input.authority || null;
  if (input.notes !== undefined) updateData.notes = input.notes || null;

  const { data, error } = await client
    .from('member_driving_licenses')
    .update(updateData)
    .eq('id', licenseId)
    .select()
    .single();

  if (error) {
    if (error.message.includes('unique')) {
      throw new DrivingLicenseServiceError(
        `Preukazové číslo alebo kombinácia kategória + krajina už existuje`,
        409,
      );
    }
    throw new DrivingLicenseServiceError(
      `Chyba pri aktualizácii vodičského preukazu: ${error.message}`,
      500,
    );
  }

  if (!data) {
    throw new DrivingLicenseServiceError('Vodičský preukaz nenájdený', 404);
  }

  return data as MemberDrivingLicense;
}

/**
 * Delete a driving license record
 * Requires MEMBERS_EDIT permission (admin/trainer can delete)
 * @param licenseId UUID of the license
 */
export async function deleteDrivingLicense(licenseId: string): Promise<void> {
  const ctx = await requireAuthenticated();

  // Check permissions - use hasPermissionServer  
  const canDelete = await hasPermissionServer(ctx.userId, PERMISSIONS.MEMBERS_EDIT);
  if (!canDelete) {
    throw new DrivingLicenseServiceError(
      'Nemáš oprávnenie na vymazanie vodičského preukazu',
      403,
    );
  }

  const client = await getSupabaseClient();

  const { error } = await client
    .from('member_driving_licenses')
    .delete()
    .eq('id', licenseId);

  if (error) {
    throw new DrivingLicenseServiceError(
      `Chyba pri vymazaní vodičského preukazu: ${error.message}`,
      500,
    );
  }
}

/**
 * Check if a driving license has expired
 * @param license License object or expiry_date string
 * @returns true if expired (or expiry_date is in the past)
 */
export function isExpired(license: MemberDrivingLicense | string): boolean {
  const expiryDate =
    typeof license === 'string' ? license : license.expiry_date;

  if (!expiryDate) return false; // No expiry date = not expired
  return new Date(expiryDate) < new Date();
}

/**
 * Check if a driving license is expiring soon
 * @param license License object or expiry_date string
 * @param days Number of days to check (default 30)
 * @returns true if license expires within N days
 */
export function isExpiringSoon(
  license: MemberDrivingLicense | string,
  days: number = 30,
): boolean {
  const expiryDate =
    typeof license === 'string' ? license : license.expiry_date;

  if (!expiryDate) return false; // No expiry date = not expiring soon
  if (isExpired(expiryDate)) return false; // Already expired

  const today = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + days);

  return new Date(expiryDate) <= cutoffDate;
}

/**
 * Get days until expiry
 * @param expiryDate Date string (YYYY-MM-DD)
 * @returns Number of days until expiry (negative if expired)
 */
export function getDaysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const diff = expiry.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24)); // Convert ms to days
}
