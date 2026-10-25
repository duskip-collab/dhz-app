import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { loadIncidentById } from "../../actions";
import { listMembers } from "@/lib/members/members.service";
import { getEquipmentItems } from "@/lib/equipment/equipment.service";
import { EditIncidentView } from "@/features/incidents/components/EditIncidentView";
import type { Member } from "@/lib/members/members.service";
import type { EquipmentItem } from "@/lib/equipment/equipment.service";

export default async function EditIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.INCIDENTS_EDIT);
  const { id } = await params;

  let incident;
  try {
    incident = await loadIncidentById(id);
  } catch {
    notFound();
  }
  if (!incident) notFound();

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

  return <EditIncidentView incident={incident} members={members} equipment={equipment} />;
}