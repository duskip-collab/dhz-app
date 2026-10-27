import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import MeetingCreateForm from "./MeetingCreateForm";

export default async function NewMeetingPage() {
  await requirePermission(PERMISSIONS.MEETINGS_CREATE);
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Nová porada</h1>
      <MeetingCreateForm />
    </div>
  );
}