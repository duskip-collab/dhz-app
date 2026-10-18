'use client';

import { useState } from 'react';
import type { MemberCourse } from '@/types/member-courses.types';
import { Trash2, Plus, Edit2 } from 'lucide-react';
import { CourseFormModal } from './CourseFormModal';

// Helper functions moved from service (client-side only)
function isExpired(course: MemberCourse): boolean {
  if (!course.expiry_date) return false;

  const expiry = new Date(course.expiry_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return expiry < today;
}

function isExpiringSoon(course: MemberCourse, daysThreshold: number = 30): boolean {
  if (!course.expiry_date) return false;

  const expiry = new Date(course.expiry_date);
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + daysThreshold);

  return expiry <= threshold;
}

interface CoursesTabProps {
  memberId: string;
  courses: MemberCourse[];
  canEdit: boolean;
  onCoursesRefresh?: () => void;
}

export function CoursesTab({
  memberId,
  courses,
  canEdit,
  onCoursesRefresh,
}: CoursesTabProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<MemberCourse | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleAddCourse = () => {
    setEditingCourse(null);
    setIsFormOpen(true);
  };

  const handleEditCourse = (course: MemberCourse) => {
    setEditingCourse(course);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingCourse(null);
  };

  const handleFormSuccess = () => {
    handleFormClose();
    onCoursesRefresh?.();
  };

  const handleDeleteCourse = async (courseId: string) => {
    setIsDeleting(courseId);
    try {
      const response = await fetch(`/api/courses/${courseId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete course');
      }

      onCoursesRefresh?.();
    } catch (error) {
      console.error('Error deleting course:', error);
      alert('Chyba pri mazaní kurzu');
    } finally {
      setIsDeleting(null);
    }
  };

  if (courses.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 mb-4">Žiadne kurzy a certifikácie</p>
        {canEdit && (
          <button
            onClick={handleAddCourse}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Pridať kurz
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={handleAddCourse}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Pridať kurz
          </button>
        </div>
      )}

      <div className="grid gap-3">
        {courses.map((course) => {
          const expired = isExpired(course);
          const expiringSoon = !expired && isExpiringSoon(course);

          return (
            <div
              key={course.id}
              className={`border rounded-lg p-4 ${
                expired
                  ? 'border-red-200 bg-red-50'
                  : expiringSoon
                    ? 'border-yellow-200 bg-yellow-50'
                    : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    {course.course_name}
                  </h3>

                  <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-gray-600">
                    {course.certification_date && (
                      <div>
                        <span className="font-medium">Certifikácia:</span>{' '}
                        {new Date(course.certification_date).toLocaleDateString(
                          'sk-SK'
                        )}
                      </div>
                    )}

                    {course.expiry_date && (
                      <div className={expired ? 'text-red-600 font-semibold' : ''}>
                        <span className="font-medium">Platnosť do:</span>{' '}
                        {new Date(course.expiry_date).toLocaleDateString('sk-SK')}
                        {expired && ' (EXPIROVANÁ)'}
                        {expiringSoon && !expired && ' (skončí sa skoro)'}
                      </div>
                    )}

                    {course.issuing_authority && (
                      <div>
                        <span className="font-medium">Vydavateľ:</span>{' '}
                        {course.issuing_authority}
                      </div>
                    )}

                    {course.certificate_number && (
                      <div>
                        <span className="font-medium">Číslo certifikátu:</span>{' '}
                        {course.certificate_number}
                      </div>
                    )}
                  </div>

                  {course.notes && (
                    <p className="mt-3 text-sm text-gray-600 italic">
                      <span className="font-medium">Poznámky:</span> {course.notes}
                    </p>
                  )}
                </div>

                {canEdit && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditCourse(course)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Upraviť"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCourse(course.id)}
                      disabled={isDeleting === course.id}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Vymazať"
                    >
                      {isDeleting === course.id ? (
                        <div className="h-4 w-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isFormOpen && (
        <CourseFormModal
          memberId={memberId}
          course={editingCourse}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
