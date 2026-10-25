import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listMembers } from "@/lib/members/members.service";
import { getEquipmentItems } from "@/lib/equipment/equipment.service";
import { NewIncidentView } from "@/features/incidents/components/NewIncidentView";
import type { Member } from "@/lib/members/members.service";
import type { EquipmentItem } from "@/lib/equipment/equipment.service";

export default async function NewIncidentPage() {
  await requirePermission(PERMISSIONS.INCIDENTS_CREATE);

  let members: Member[] = [];
  let equipment: EquipmentItem[] = [];
  try {
    members = await listMembers({ status: "active" });
  } catch {
    members = [];
  }
  try {
    equipment = await getEquipmentItems({ limit: 500 });
  } catch {
    equipment = [];
  }

  return <NewIncidentView members={members} equipment={equipment} />;
}