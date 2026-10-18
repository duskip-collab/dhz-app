'use client';

/**
 * DrivingLicensesTab Component
 * Displays list of member's driving licenses with edit/delete actions
 * Shows expiry status with color coding (red=expired, yellow=expiring soon)
 */

import { useState, useEffect } from 'react';
import { Loader, Plus, Edit2, Trash2, AlertCircle, Clock } from 'lucide-react';
import type { MemberDrivingLicense } from '@/types/member-driving-licenses.types';
import DrivingLicenseFormModal from './DrivingLicenseFormModal';

// Helper functions (client-side only, duplicated from service)
function isExpired(license: MemberDrivingLicense | string): boolean {
  const expiryDate =
    typeof license === 'string' ? license : license.expiry_date;

  if (!expiryDate) return false;
  return new Date(expiryDate) < new Date();
}

function isExpiringSoon(
  license: MemberDrivingLicense | string,
  days: number = 30,
): boolean {
  const expiryDate =
    typeof license === 'string' ? license : license.expiry_date;

  if (!expiryDate) return false;
  if (isExpired(expiryDate)) return false;

  const today = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + days);

  return new Date(expiryDate) <= cutoffDate;
}

function getDaysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const diff = expiry.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

interface DrivingLicensesTabProps {
  memberId: string;
  canEdit?: boolean;
}

export default function DrivingLicensesTab({
  memberId,
  canEdit = false,
}: DrivingLicensesTabProps) {
  const [licenses, setLicenses] = useState<MemberDrivingLicense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<MemberDrivingLicense | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Load licenses on mount
  useEffect(() => {
    loadLicenses();
  }, [memberId]);

  async function loadLicenses() {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch from API endpoint instead of service layer
      const response = await fetch(`/api/driving-licenses?member_id=${memberId}`);
      if (!response.ok) {
        throw new Error('Chyba pri načítaní vodičských preukázok');
      }
      
      const data = await response.json();
      setLicenses(data.data || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Chyba pri načítaní vodičských preukázok',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Naozaj chceš vymazať tento vodičský preukaz?')) return;

    try {
      setIsDeleting(id);
      const response = await fetch(`/api/driving-licenses/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Chyba pri vymazaní');
      }

      setLicenses((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Chyba pri vymazaní');
    } finally {
      setIsDeleting(null);
    }
  }

  function getExpiryStatus(license: MemberDrivingLicense) {
    if (!license.expiry_date) {
      return { type: 'none', text: 'Bez expirácie', color: 'text-gray-600' };
    }

    if (isExpired(license)) {
      return {
        type: 'expired',
        text: 'Vypršal',
        color: 'text-red-600 bg-red-50',
      };
    }

    if (isExpiringSoon(license)) {
      const days = getDaysUntilExpiry(license.expiry_date);
      return {
        type: 'expiring',
        text: `Vypršíva za ${days} dni`,
        color: 'text-amber-600 bg-amber-50',
      };
    }

    return {
      type: 'valid',
      text: 'Platný',
      color: 'text-green-600 bg-green-50',
    };
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="h-5 w-5 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <div className="ml-3">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Vodičské preukazy</h3>
        {canEdit && (
          <button
            onClick={() => {
              setSelectedLicense(null);
              setShowModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Pridať preukaz
          </button>
        )}
      </div>

      {/* Empty state */}
      {licenses.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">
            Žiadne vodičské preukazy nie sú zaznamenané
          </p>
          {canEdit && (
            <button
              onClick={() => {
                setSelectedLicense(null);
                setShowModal(true);
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Pridať prvý preukaz
            </button>
          )}
        </div>
      ) : (
        /* Licenses list */
        <div className="space-y-3">
          {licenses.map((license) => {
            const status = getExpiryStatus(license);
            return (
              <div
                key={license.id}
                className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-4 hover:shadow-sm"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        Kategória {license.category}
                      </p>
                      <p className="text-sm text-gray-600">
                        {license.country_code} • {license.license_number}
                      </p>
                      {license.authority && (
                        <p className="text-xs text-gray-500">{license.authority}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center gap-1 text-xs">
                      <Clock className="h-3 w-3" />
                      Vydaný:{' '}
                      {new Date(license.issue_date).toLocaleDateString('sk-SK')}
                    </div>

                    {license.expiry_date && (
                      <div
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${status.color}`}
                      >
                        {status.text}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {canEdit && (
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedLicense(license);
                        setShowModal(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
                      title="Upraviť"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(license.id)}
                      disabled={isDeleting === license.id}
                      className="inline-flex items-center gap-1 rounded-md bg-red-100 px-3 py-2 text-sm font-medium text-red-900 hover:bg-red-200 disabled:opacity-50"
                      title="Vymazať"
                    >
                      {isDeleting === license.id ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <DrivingLicenseFormModal
          memberId={memberId}
          license={selectedLicense}
          onClose={() => {
            setShowModal(false);
            setSelectedLicense(null);
          }}
          onSave={() => {
            setShowModal(false);
            setSelectedLicense(null);
            loadLicenses();
          }}
        />
      )}
    </div>
  );
}
