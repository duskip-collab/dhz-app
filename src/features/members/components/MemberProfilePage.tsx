'use client';

import { useState } from 'react';
import { Calendar, Briefcase, Trophy, Heart, FileText, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import type { MemberProfile, MemberProfileStats } from '@/lib/members/member-profile.service';

type TabId = 'overview' | 'gear' | 'training' | 'competitions' | 'guardians';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Prehľad', icon: <AlertCircle className="h-4 w-4" /> },
  { id: 'gear', label: 'Výstroj', icon: <Briefcase className="h-4 w-4" /> },
  { id: 'training', label: 'Tréningy', icon: <Calendar className="h-4 w-4" /> },
  { id: 'competitions', label: 'Súťaže', icon: <Trophy className="h-4 w-4" /> },
  { id: 'guardians', label: 'Opatrovníci', icon: <Heart className="h-4 w-4" /> },
];

export function MemberProfileContent({
  profile,
  photoUrl,
  stats,
}: {
  profile: MemberProfile;
  photoUrl: string | null;
  stats: MemberProfileStats;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-[#C62828] text-[#C62828]'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && (
          <OverviewTab profile={profile} stats={stats} />
        )}
        {activeTab === 'gear' && (
          <GearTab gear={profile.gear} />
        )}
        {activeTab === 'training' && (
          <TrainingTab training={profile.training} />
        )}
        {activeTab === 'competitions' && (
          <CompetitionsTab competitions={profile.competitions} />
        )}
        {activeTab === 'guardians' && (
          <GuardiansTab guardians={profile.guardians} />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// TAB: PREHĽAD
// =============================================================================

function OverviewTab({
  profile,
  stats,
}: {
  profile: MemberProfile;
  stats: MemberProfileStats;
}) {
  const member = profile.member;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Základné údaje */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 lg:col-span-2">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Základné údaje</h3>
        <div className="space-y-4">
          <DetailRow label="Členský stav" value={member.status === 'active' ? '✓ Aktívny' : '⊗ Neaktívny'} />
          <DetailRow label="Typ člena" value={member.membership_type || '—'} />
          {member.birth_date && (
            <DetailRow
              label="Dátum narodenia"
              value={new Date(member.birth_date).toLocaleDateString('sk-SK', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            />
          )}
          {member.phone && <DetailRow label="Telefón" value={member.phone} />}
          {member.email && <DetailRow label="Email" value={member.email} />}
          {member.address && <DetailRow label="Adresa" value={member.address} />}
          {member.joined_at && (
            <DetailRow
              label="Vstúp do jednotky"
              value={new Date(member.joined_at).toLocaleDateString('sk-SK', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            />
          )}
          {member.notes && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-medium uppercase text-gray-500">Poznámky</p>
              <p className="mt-2 text-sm text-gray-800">{member.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Rýchle linky a akcie */}
      <div className="space-y-4">
        <QuickStatCard label="Pridelená výstroj" value={stats.activeGearCount} />
        <QuickStatCard label="Tréningy" value={stats.totalTrainingAttendances} />
        <QuickStatCard label="Súťaže" value={stats.totalCompetitions} />
        <QuickStatCard label="Opatrovníci" value={profile.guardians.length} />
      </div>
    </div>
  );
}

// =============================================================================
// TAB: VÝSTROJ
// =============================================================================

function GearTab({ gear }: { gear: any[] }) {
  if (gear.length === 0) {
    return <EmptyState title="Žiadna výstroj" text="Tomuto členovi nebola pridelená žiadna výstroj." />;
  }

  const active = gear.filter((g) => !g.returned_at);
  const returned = gear.filter((g) => g.returned_at);

  return (
    <div className="space-y-6">
      {/* Aktívna výstroj */}
      {active.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Aktívna výstroj ({active.length})
          </h3>
          <div className="grid gap-3">
            {active.map((item) => (
              <div key={item.id} className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{item.equipment.name}</p>
                    <p className="text-sm text-gray-600">
                      Evidenčné číslo: {item.equipment.inventory_number}
                    </p>
                    <p className="text-xs text-gray-500">
                      Kategória: {item.equipment.category}
                    </p>
                    {item.note && (
                      <p className="mt-2 text-sm text-gray-700">Poznámka: {item.note}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-green-200 px-3 py-1 text-xs font-medium text-green-800">
                    Aktívna
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vrátená výstroj */}
      {returned.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Vrátená výstroj ({returned.length})
          </h3>
          <div className="grid gap-3">
            {returned.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 opacity-75">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{item.equipment.name}</p>
                    <p className="text-sm text-gray-600">
                      Evidenčné číslo: {item.equipment.inventory_number}
                    </p>
                    <p className="text-xs text-gray-500">
                      Vrátená: {new Date(item.returned_at).toLocaleDateString('sk-SK')}
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700">
                    Vrátená
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TAB: TRÉNINGY
// =============================================================================

function TrainingTab({ training }: { training: any[] }) {
  if (training.length === 0) {
    return <EmptyState title="Žiadne tréningy" text="Tento člen zatiaľ nie je zaregistrovaný na žiadny tréning." />;
  }

  // Zoskupí podľa statusu
  const byStatus = training.reduce(
    (acc, t) => {
      const status = t.status;
      if (!acc[status]) acc[status] = [];
      acc[status].push(t);
      return acc;
    },
    {} as Record<string, any[]>
  );

  return (
    <div className="space-y-6">
      {Object.entries(byStatus).map(([status, itemsArray]) => {
        const items = itemsArray as any[];
        return (
          <div key={status}>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              {getTrainingStatusLabel(status)} ({items.length})
            </h3>
            <div className="grid gap-3">
              {items.map((item: any) => (
                <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.training.title}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(item.training.start_time).toLocaleDateString('sk-SK')} •{' '}
                        {new Date(item.training.start_time).toLocaleTimeString('sk-SK', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {item.training.location && (
                        <p className="text-sm text-gray-600">Miesto: {item.training.location}</p>
                      )}
                      {item.note && <p className="mt-2 text-sm text-gray-700">Poznámka: {item.note}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item.status)}
                      <span className="text-xs font-medium text-gray-600">{getStatusLabel(item.status)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// TAB: SÚŤAŽE
// =============================================================================

function CompetitionsTab({ competitions }: { competitions: any[] }) {
  if (competitions.length === 0) {
    return <EmptyState title="Žiadne súťaže" text="Tento člen sa zatiaľ nezúčastnil žiadnej súťaže." />;
  }

  // Zoskupí podľa súťaže
  const byCompetition = competitions.reduce(
    (acc, c) => {
      const compId = c.team.competition.id;
      if (!acc[compId]) acc[compId] = [];
      acc[compId].push(c);
      return acc;
    },
    {} as Record<string, any[]>
  );

  return (
    <div className="space-y-4">
      {Object.entries(byCompetition).map(([, itemsArray]) => {
        const items = itemsArray as any[];
        const comp = items[0].team.competition;
        const team = items[0].team;

        return (
          <div key={comp.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="font-medium text-gray-900">{comp.title}</p>
                <p className="text-sm text-gray-600">
                  {new Date(comp.date).toLocaleDateString('sk-SK', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </p>
                {comp.location && <p className="text-sm text-gray-600">Miesto: {comp.location}</p>}
                <p className="text-xs text-gray-500">Kategória: {comp.category}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Tím: {team.name}</p>
                {team.result_points !== null && (
                  <p className="text-sm text-gray-600">Body: {team.result_points}</p>
                )}
                {team.rank !== null && (
                  <p className="text-sm text-gray-600">Umiestnenie: {team.rank}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// TAB: OPATROVNÍCI
// =============================================================================

function GuardiansTab({ guardians }: { guardians: any[] }) {
  if (guardians.length === 0) {
    return <EmptyState title="Žádní opatrovníci" text="Pre tohto člena nie sú registrovaní žiadni opatrovníci." />;
  }

  return (
    <div className="grid gap-3">
      {guardians.map((guardian) => (
        <div key={guardian.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-900">{guardian.guardian_full_name}</p>
              <p className="text-sm text-gray-600">
                Vzťah: {guardian.relationship}
              </p>
              {guardian.phone && <p className="text-sm text-gray-600">Tel: {guardian.phone}</p>}
              {guardian.email && <p className="text-sm text-gray-600">Email: {guardian.email}</p>}
            </div>
            {guardian.is_primary_contact && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                Primárny kontakt
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// HELPER KOMPONENTY
// =============================================================================

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between border-b border-gray-100 py-3 last:border-0">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}

function QuickStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
      <p className="font-medium text-gray-700">{title}</p>
      <p className="mt-1 text-sm text-gray-600">{text}</p>
    </div>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'PRESENT':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'ABSENT':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'EXCUSED':
      return <Clock className="h-5 w-5 text-yellow-500" />;
    case 'LATE':
      return <AlertCircle className="h-5 w-5 text-orange-500" />;
    default:
      return null;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'PRESENT':
      return 'Prítomný';
    case 'ABSENT':
      return 'Neprítomný';
    case 'EXCUSED':
      return 'Ospravedlnený';
    case 'LATE':
      return 'Neskôr';
    default:
      return status;
  }
}

function getTrainingStatusLabel(status: string) {
  switch (status) {
    case 'PRESENT':
      return 'Zúčastnil sa';
    case 'ABSENT':
      return 'Neprítomný';
    case 'EXCUSED':
      return 'Ospravedlnený';
    case 'LATE':
      return 'Prišiel neskôr';
    default:
      return status;
  }
}
