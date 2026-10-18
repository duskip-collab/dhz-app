/**
 * PUT /api/courses/[id]
 * Update a member course
 * 
 * DELETE /api/courses/[id]
 * Delete a member course
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  updateMemberCourse,
  deleteMemberCourse,
} from '@/lib/members/member-courses.service';
import {
  validateMemberCourseInput,
  sanitizeMemberCourseInput,
} from '@/features/members/schemas/courses.validation';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Validate input (partial update)
    const validation = validateMemberCourseInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          message: 'Neplatné údaje',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    // Sanitize input
    const sanitized = sanitizeMemberCourseInput(body);
    if (!sanitized) {
      return NextResponse.json(
        {
          success: false,
          message: 'Chyba pri spracovaní údajov',
        },
        { status: 400 }
      );
    }

    // Update course
    const course = await updateMemberCourse(id, sanitized);

    return NextResponse.json(
      {
        success: true,
        data: course,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[PUT /api/courses/[id]]', error);

    if (error instanceof Error) {
      if (error.message.includes('Authentifikácia')) {
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 401 }
        );
      }
      if (error.message.includes('oprávnenie')) {
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Chyba pri aktualizácii kurzu',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Delete course
    await deleteMemberCourse(id);

    return NextResponse.json(
      {
        success: true,
        message: 'Kurz bol vymazaný',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[DELETE /api/courses/[id]]', error);

    if (error instanceof Error) {
      if (error.message.includes('Authentifikácia')) {
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 401 }
        );
      }
      if (error.message.includes('oprávnenie')) {
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Chyba pri mazaní kurzu',
      },
      { status: 500 }
    );
  }
}
