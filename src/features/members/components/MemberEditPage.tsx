"use client";

import { useRouter } from "next/navigation";
import type { Member, MemberGuardian } from "@/lib/members/members.service";
import { MemberForm } from "./MemberForm";
import { GuardianSection } from "./GuardianSection";
import { MemberPhotoUpload } from "./MemberPhotoUpload";
import {
  createGuardianAction,
  deleteGuardianAction,
  updateGuardianAction,
  updateMemberAction,
  uploadMemberPhotoAction,
} from "@/app/(app)/members/actions";

/**
 * Klientský wrapper stránky /members/[id]/edit.
 * Spája členský formulár + fotografiu + správu zákonných zástupcov.
 */
export function MemberEditPage({
  member,
  guardians,
  photoUrl,
}: {
  member: Member;
  guardians: MemberGuardian[];
  photoUrl: string | null;
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <MemberForm
          member={member}
          action={updateMemberAction.bind(null, member.id)}
          onCancel={() => router.back()}
          // Po uložení údajov člena sa serverová stránka znovu vykreslí
          // (obnoví sa aj prehľad zástupcov a fotografia).
          onSuccess={() => router.refresh()}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-gray-900">Fotografia člena</h2>
        <MemberPhotoUpload
          action={uploadMemberPhotoAction.bind(null, member.id)}
          currentPhotoUrl={photoUrl}
        />
      </div>

      <GuardianSection
        memberId={member.id}
        guardians={guardians}
        canEdit
        createAction={createGuardianAction}
        updateAction={updateGuardianAction}
        deleteAction={deleteGuardianAction}
      />
    </div>
  );
}