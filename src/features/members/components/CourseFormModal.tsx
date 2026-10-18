'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { MemberCourse } from '@/types/member-courses.types';
import {
  validateMemberCourseInput,
  sanitizeMemberCourseInput,
  type MemberCourseValidationError,
} from '@/features/members/schemas/courses.validation';

interface CourseFormModalProps {
  memberId: string;
  course: MemberCourse | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  course_name: string;
  certification_date: string;
  expiry_date: string;
  issuing_authority: string;
  certificate_number: string;
  notes: string;
}

export function CourseFormModal({
  memberId,
  course,
  onClose,
  onSuccess,
}: CourseFormModalProps) {
  const isEditing = !!course;

  const [formData, setFormData] = useState<FormData>({
    course_name: course?.course_name || '',
    certification_date: course?.certification_date || '',
    expiry_date: course?.expiry_date || '',
    issuing_authority: course?.issuing_authority || '',
    certificate_number: course?.certificate_number || '',
    notes: course?.notes || '',
  });

  const [errors, setErrors] = useState<MemberCourseValidationError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field
    setErrors((prev) =>
      prev.filter((err) => err.field !== name)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    const validation = validateMemberCourseInput(formData);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);

    try {
      const sanitized = sanitizeMemberCourseInput(formData);
      if (!sanitized) {
        throw new Error('Invalid form data');
      }

      const endpoint = isEditing
        ? `/api/courses/${course.id}`
        : `/api/courses`;

      const method = isEditing ? 'PUT' : 'POST';

      const payload = {
        ...sanitized,
        ...(isEditing ? {} : { member_id: memberId }),
      };

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save course');
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving course:', error);
      setErrors([
        {
          field: 'root',
          message: error instanceof Error ? error.message : 'Chyba pri uložení',
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFieldError = (fieldName: string) => {
    return errors.find((err) => err.field === fieldName)?.message;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Upraviť kurz' : 'Pridať nový kurz'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Root error */}
          {errors.some((err) => err.field === 'root') && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {errors.find((err) => err.field === 'root')?.message}
            </div>
          )}

          {/* Course name */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Názov kurzu *
            </label>
            <input
              type="text"
              name="course_name"
              value={formData.course_name}
              onChange={handleChange}
              placeholder="napr. CPR a prvá pomoc"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                getFieldError('course_name')
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {getFieldError('course_name') && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError('course_name')}
              </p>
            )}
          </div>

          {/* Certification date */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Dátum certifikácie
            </label>
            <input
              type="date"
              name="certification_date"
              value={formData.certification_date}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                getFieldError('certification_date')
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {getFieldError('certification_date') && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError('certification_date')}
              </p>
            )}
          </div>

          {/* Expiry date */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Platnosť do
            </label>
            <input
              type="date"
              name="expiry_date"
              value={formData.expiry_date}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                getFieldError('expiry_date')
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {getFieldError('expiry_date') && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError('expiry_date')}
              </p>
            )}
          </div>

          {/* Issuing authority */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Vydavateľská inštitúcia
            </label>
            <input
              type="text"
              name="issuing_authority"
              value={formData.issuing_authority}
              onChange={handleChange}
              placeholder="napr. Slovenský Červený kríž"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                getFieldError('issuing_authority')
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {getFieldError('issuing_authority') && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError('issuing_authority')}
              </p>
            )}
          </div>

          {/* Certificate number */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Číslo certifikátu
            </label>
            <input
              type="text"
              name="certificate_number"
              value={formData.certificate_number}
              onChange={handleChange}
              placeholder="napr. 2023-001234"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                getFieldError('certificate_number')
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {getFieldError('certificate_number') && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError('certificate_number')}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Poznámky
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Dodatočné informácie..."
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                getFieldError('notes')
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {getFieldError('notes') && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError('notes')}
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Ukladám...' : isEditing ? 'Uložiť zmeny' : 'Pridať kurz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
