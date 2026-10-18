'use client';

/**
 * DrivingLicenseFormModal Component
 * Modal form for creating and editing driving licenses
 * Handles validation and submission
 */

import { useState } from 'react';
import { X, Loader } from 'lucide-react';
import { validateDrivingLicenseInput } from '@/features/members/schemas/driving-licenses.validation';
import type {
  MemberDrivingLicense,
  MemberDrivingLicenseInput,
  DrivingLicenseFormErrors,
} from '@/types/member-driving-licenses.types';

interface DrivingLicenseFormModalProps {
  memberId: string;
  license?: MemberDrivingLicense | null;
  onClose: () => void;
  onSave: () => void;
}

export default function DrivingLicenseFormModal({
  memberId,
  license,
  onClose,
  onSave,
}: DrivingLicenseFormModalProps) {
  const isEditing = !!license;

  const [formData, setFormData] = useState<MemberDrivingLicenseInput>({
    category: license?.category || '',
    issue_date: license?.issue_date || '',
    expiry_date: license?.expiry_date || null,
    country_code: license?.country_code || '',
    license_number: license?.license_number || '',
    authority: license?.authority || null,
    notes: license?.notes || null,
  });

  const [errors, setErrors] = useState<DrivingLicenseFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setErrors({});

    // Validate
    const { valid, errors: validationErrors } = validateDrivingLicenseInput(
      formData,
      false,
    );

    if (!valid) {
      setErrors(validationErrors);
      return;
    }

    try {
      setIsSubmitting(true);

      const url = isEditing
        ? `/api/driving-licenses/${license!.id}`
        : '/api/driving-licenses';

      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEditing
            ? formData
            : {
                member_id: memberId,
                ...formData,
              },
        ),
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.errors) {
          setErrors(data.errors);
        }
        throw new Error(
          data.error || 'Chyba pri ukladaní vodičského preukazu',
        );
      }

      onSave();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Neznáma chyba',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const licenseCategories = [
    'A', 'A1', 'A2', 'AM', 'B', 'B1', 'C', 'C1', 'D', 'D1',
  ];
  const countryCodes = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
    'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT',
    'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'US', 'CA',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Upraviť preukaz' : 'Pridať vodičský preukaz'}
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          {submitError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-900">
              Kategória *
            </label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
                errors.category
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            >
              <option value="">Vyber kategóriu</option>
              {licenseCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="mt-1 text-xs text-red-600">{errors.category}</p>
            )}
          </div>

          {/* Country Code */}
          <div>
            <label className="block text-sm font-medium text-gray-900">
              Krajina *
            </label>
            <select
              value={formData.country_code}
              onChange={(e) =>
                setFormData({ ...formData, country_code: e.target.value })
              }
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
                errors.country_code
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            >
              <option value="">Vyber krajinu</option>
              {countryCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            {errors.country_code && (
              <p className="mt-1 text-xs text-red-600">
                {errors.country_code}
              </p>
            )}
          </div>

          {/* License Number */}
          <div>
            <label className="block text-sm font-medium text-gray-900">
              Číslo preukazu *
            </label>
            <input
              type="text"
              value={formData.license_number}
              onChange={(e) =>
                setFormData({ ...formData, license_number: e.target.value })
              }
              placeholder="Napr. AB123456"
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
                errors.license_number
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {errors.license_number && (
              <p className="mt-1 text-xs text-red-600">
                {errors.license_number}
              </p>
            )}
          </div>

          {/* Issue Date */}
          <div>
            <label className="block text-sm font-medium text-gray-900">
              Dátum vydania *
            </label>
            <input
              type="date"
              value={formData.issue_date}
              onChange={(e) =>
                setFormData({ ...formData, issue_date: e.target.value })
              }
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
                errors.issue_date
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {errors.issue_date && (
              <p className="mt-1 text-xs text-red-600">{errors.issue_date}</p>
            )}
          </div>

          {/* Expiry Date */}
          <div>
            <label className="block text-sm font-medium text-gray-900">
              Dátum expirácie (voliteľné)
            </label>
            <input
              type="date"
              value={formData.expiry_date || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  expiry_date: e.target.value || null,
                })
              }
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
                errors.expiry_date
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {errors.expiry_date && (
              <p className="mt-1 text-xs text-red-600">{errors.expiry_date}</p>
            )}
          </div>

          {/* Authority */}
          <div>
            <label className="block text-sm font-medium text-gray-900">
              Vydávajúca autorita (voliteľné)
            </label>
            <input
              type="text"
              value={formData.authority || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  authority: e.target.value || null,
                })
              }
              placeholder="Napr. SPŠ Banská Bystrica"
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
                errors.authority
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {errors.authority && (
              <p className="mt-1 text-xs text-red-600">{errors.authority}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-900">
              Poznámky (voliteľné)
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  notes: e.target.value || null,
                })
              }
              placeholder="Napr. Obnová poznámka, obmedzenia"
              rows={3}
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
                errors.notes
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300'
              }`}
            />
            {errors.notes && (
              <p className="mt-1 text-xs text-red-600">{errors.notes}</p>
            )}
          </div>

          {/* Root errors */}
          {errors.root && errors.root.length > 0 && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {errors.root.join(', ')}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            Zrušiť
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting && <Loader className="h-4 w-4 animate-spin" />}
            {isEditing ? 'Uložiť zmeny' : 'Pridať preukaz'}
          </button>
        </div>
      </div>
    </div>
  );
}
