import {
  ArrowLeft,
  Briefcase,
  Calendar,
  FileText,
  Heart,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getMemberById, getMemberPhotoUrl } from "@/lib/members/members.service";
import { getMemberProfile, getMemberProfileStats } from "@/lib/members/member-profile.service";
import { MemberProfileContent } from "@/features/members/components/MemberProfilePage";
import { DeleteMemberButton } from "@/features/members/components/DeleteMemberButton";

export const metadata = {
  title: "Profil člena",
};

/**
 * Member Profile Page
 * 
 * Zobrazuje detailný profil člena vrátane:
 * - základné údaje a foto
 * - opatrovníci (ak je mladší člen)
 * - aktívna pridelená výstroj
 * - tréningy a dochádzka
 * - reprezentácia a súťaže
 * - štatistiky a odkazy
 */
export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Permission check: musí mať oprávnenie čítať členov
  const ctx = await requirePermission(PERMISSIONS.MEMBERS_VIEW);
  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.MEMBERS_EDIT);
  const canDelete = hasPermission(ctx.permissions, PERMISSIONS.MEMBERS_DELETE);

  // Načítaj kompletný profil
  let profile;
  try {
    profile = await getMemberProfile(id);
  } catch (e) {
    const error = e as { statusCode?: number; message?: string };
    if (error.statusCode === 404) {
      notFound();
    }
    throw e;
  }

  // Načítaj foto (signed URL)
  let photoUrl: string | null = null;
  if (profile.member.photo_path) {
    try {
      photoUrl = await getMemberPhotoUrl(profile.member.photo_path);
    } catch {
      photoUrl = null;
    }
  }

  // Vypočítaj štatistiky
  const stats = getMemberProfileStats(profile);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Back button */}
      <Link
        href="/members"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
      >
        <ArrowLeft className="h-4 w-4" /> Späť na členov
      </Link>

      {/* Header – Meno, foto, badges */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          {/* Foto a základné údaje */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
            {/* Foto */}
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100">
              {photoUrl ? (
                <img src={photoUrl} alt={`${profile.member.first_name} ${profile.member.last_name}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-200 text-gray-400">
                  <span className="text-lg font-semibold">
                    {profile.member.first_name.charAt(0)}
                    {profile.member.last_name.charAt(0)}
                  </span>
                </div>
              )}
            </div>

            {/* Základné údaje */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {profile.member.title ? `${profile.member.title} ` : ""}
                {profile.member.first_name} {profile.member.last_name}
              </h1>
              {(profile.member.rank || profile.member.position) && (
                <p className="mt-1 text-sm font-medium text-gray-700">
                  {profile.member.rank ? `Hodnosť: ${profile.member.rank}` : ""}
                  {profile.member.rank && profile.member.position ? " · " : ""}
                  {profile.member.position ? `Zaradenie: ${profile.member.position}` : ""}
                </p>
              )}
              {profile.member.is_committee_member && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  Člen výboru DHZ
                </p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                Číslo člena: {profile.member.member_number}
              </p>
              {profile.member.email && (
                <p className="text-sm text-gray-500">{profile.member.email}</p>
              )}
            </div>
          </div>

          {/* Akcie – Edit (iba s oprávnením MEMBERS_EDIT) + Zmazať (MEMBERS_DELETE) */}
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Link
                href={`/members/${id}/edit`}
                className="inline-flex items-center gap-2 rounded-lg bg-[#C62828] px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Upraviť profil
              </Link>
            )}
            {canDelete && (
              <DeleteMemberButton
                memberId={profile.member.id}
                memberName={`${profile.member.first_name} ${profile.member.last_name}`}
              />
            )}
          </div>
        </div>
      </div>

      {/* Štatistiky – Rýchly prehľad */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={Briefcase} label="Výstroj" value={stats.activeGearCount} suffix={`/${stats.totalGearAssigned}`} />
        <StatCard icon={Calendar} label="Dochádzka" value={stats.presentCount} suffix={`/${stats.totalTrainingAttendances}`} />
        <StatCard icon={Trophy} label="Súťaže" value={stats.totalCompetitions} suffix="" />
        <StatCard icon={Heart} label="Opatrovníci" value={profile.guardians.length} suffix="" />
        <StatCard icon={FileText} label="Dokumenty" value={0} suffix="" />
      </div>

      {/* Sekcia: Prehľad */}
      <MemberProfileContent profile={profile} photoUrl={photoUrl} stats={stats} canEdit={canEdit} />
    </div>
  );
}

/**
 * StatCard – Zjednodušená karta štatistiky
 */
/**
 * StatCard – Zjednodušená karta štatistiky
 */
function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
      <div className="flex justify-center text-gray-400">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {suffix && <p className="text-xs text-gray-500">{suffix}</p>}
      <p className="mt-1 text-xs font-medium text-gray-600">{label}</p>
    </div>
  );
}
