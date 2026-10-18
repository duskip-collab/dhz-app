"use client";

import { useRouter } from "next/navigation";
import { MemberForm } from "./MemberForm";
import { createMemberAction } from "@/app/(app)/members/actions";

/** Klientský wrapper stránky /members/new – stará sa o navigáciu po uložení. */
export function MemberCreatePage() {
  const router = useRouter();

  return (
    <MemberForm
      action={createMemberAction}
      onCancel={() => router.back()}
      onSuccess={() => router.push("/members?success=created")}
    />
  );
}