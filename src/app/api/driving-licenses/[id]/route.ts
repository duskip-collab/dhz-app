/**
 * PUT /api/driving-licenses/[id]
 * Update an existing driving license record
 * DELETE /api/driving-licenses/[id]
 * Delete a driving license record (admin only)
 * Authentication required: Yes
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  updateDrivingLicense,
  deleteDrivingLicense,
  DrivingLicenseServiceError,
} from '@/lib/members/member-driving-licenses.service';
import { validateAndSanitizeDrivingLicense } from '@/features/members/schemas/driving-licenses.validation';
import type { MemberDrivingLicenseInput } from '@/types/member-driving-licenses.types';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID preukazu je povinný' },
        { status: 400 },
      );
    }

    const body = await request.json();

    // Validate and sanitize input (partial - only update provided fields)
    const { valid, errors, sanitized } = validateAndSanitizeDrivingLicense(
      body as Partial<MemberDrivingLicenseInput>,
      true, // Partial update
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

    // Update license
    const license = await updateDrivingLicense(id, sanitized);

    return NextResponse.json({ success: true, data: license });
  } catch (error) {
    if (error instanceof DrivingLicenseServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code },
      );
    }

    console.error('[PUT /api/driving-licenses/[id]]', error);
    return NextResponse.json(
      { error: 'Chyba pri aktualizácii vodičského preukazu' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID preukazu je povinný' },
        { status: 400 },
      );
    }

    // Delete license
    await deleteDrivingLicense(id);

    return NextResponse.json({ success: true, message: 'Preukaz bol vymazaný' });
  } catch (error) {
    if (error instanceof DrivingLicenseServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code },
      );
    }

    console.error('[DELETE /api/driving-licenses/[id]]', error);
    return NextResponse.json(
      { error: 'Chyba pri vymazaní vodičského preukazu' },
      { status: 500 },
    );
  }
}
