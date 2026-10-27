import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import WorkPartyCreateForm from "./WorkPartyCreateForm";

export default async function NewWorkPartyPage() {
  await requirePermission(PERMISSIONS.WORK_PARTIES_CREATE);
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Nová brigáda</h1>
      <WorkPartyCreateForm />
    </div>
  );
}