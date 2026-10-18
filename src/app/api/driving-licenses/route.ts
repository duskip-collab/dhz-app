/**
 * GET /api/driving-licenses?member_id=...
 * POST /api/driving-licenses
 * Get all driving licenses for a member, or create a new one
 * Authentication required: Yes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createDrivingLicense, getMemberDrivingLicenses, DrivingLicenseServiceError } from '@/lib/members/member-driving-licenses.service';
import { validateAndSanitizeDrivingLicense } from '@/features/members/schemas/driving-licenses.validation';
import type { MemberDrivingLicenseInput } from '@/types/member-driving-licenses.types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const member_id = searchParams.get('member_id');

    if (!member_id) {
      return NextResponse.json(
        { error: 'member_id query parameter je povinný' },
        { status: 400 },
      );
    }

    // Get licenses for member
    const licenses = await getMemberDrivingLicenses(member_id);

    return NextResponse.json({ success: true, data: licenses });
  } catch (error) {
    if (error instanceof DrivingLicenseServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code },
      );
    }

    console.error('[GET /api/driving-licenses]', error);
    return NextResponse.json(
      { error: 'Chyba pri načítaní vodičských preukázok' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract member_id and license data
    const { member_id, ...licenseData } = body;

    if (!member_id) {
      return NextResponse.json(
        { error: 'member_id je povinný' },
        { status: 400 },
      );
    }

    // Validate and sanitize input
    const { valid, errors, sanitized } = validateAndSanitizeDrivingLicense(
      licenseData as Partial<MemberDrivingLicenseInput>,
      false, // Not partial (full validation)
    );

    if (!valid) {
      return NextResponse.json(
        {
          error: 'Validácia formulára zlyhal',
          errors,
        },
        { status: 400 },
      );
    }

    if (!sanitized) {
      return NextResponse.json(
        { error: 'Validácia bezpečnosti zlyhal' },
        { status: 400 },
      );
    }

    // Create license
    const license = await createDrivingLicense(member_id, sanitized);

    return NextResponse.json({ success: true, data: license }, { status: 201 });
  } catch (error) {
    if (error instanceof DrivingLicenseServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code },
      );
    }

    console.error('[POST /api/driving-licenses]', error);
    return NextResponse.json(
      { error: 'Chyba pri vytvorení vodičského preukazu' },
      { status: 500 },
    );
  }
}
