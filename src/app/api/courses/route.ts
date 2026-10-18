/**
 * POST /api/courses
 * Create a new member course
 */

import { NextRequest, NextResponse } from 'next/server';
import { createMemberCourse } from '@/lib/members/member-courses.service';
import {
  validateMemberCourseInput,
  sanitizeMemberCourseInput,
} from '@/features/members/schemas/courses.validation';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate input
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

    // Create course
    const course = await createMemberCourse(body.member_id, sanitized);

    return NextResponse.json(
      {
        success: true,
        data: course,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/courses]', error);

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
      if (error.message.includes('existuje')) {
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Chyba pri vytváraní kurzu',
      },
      { status: 500 }
    );
  }
}
