import { ArrowLeft, Undo2 } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getAllAssignments,
  type AssignmentWithDetails,
} from "@/lib/equipment/equipment.service";
import { listMembers } from "@/lib/members/members.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { returnGearAction } from "../actions";

const CONDITION_LABELS: Record<string, string> = {
  NEW: "NovĂ©",
  GOOD: "DobrĂ©",
  FAIR: "PouĹľitĂ©",
  POOR: "OpotrebovanĂ©",
  UNSERVICEABLE: "NeschopnĂ© sluĹľby",
};

export default async function GearAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;
  const memberId = typeof sp.member_id === "string" ? sp.member_id : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;

  const [assignments, members] = await Promise.all([
    getAllAssignments({ member_id: memberId }),
    listMembers(),
  ]);

  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.INVENTORY_EDIT);
  const selectedMember = memberId
    ? members.find((m) => m.id === memberId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/gear"
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
          >
            <ArrowLeft className="h-4 w-4" /> SpĂ¤ĹĄ na inventĂˇr
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Priradenia techniky</h1>
          <p className="mt-1 text-sm text-gray-500">
            PrehÄľad vĂ˝dajov techniky a vĂ˝stroje ÄŤlenom.
          </p>
        </div>
        {canEdit && (
          <Link href="/gear/assign">
            <Button variant="primary" size="sm">+ NovĂ© priradenie</Button>
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {success}
        </div>
      )}

      <form
        method="get"
        className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"
      >
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label
              htmlFor="member_id"
              className="block text-xs font-semibold text-gray-500 uppercase mb-1"
            >
              FiltrovaĹĄ podÄľa ÄŤlena
            </label>
            <select
              id="member_id"
              name="member_id"
              defaultValue={memberId ?? ""}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white"
            >
              <option value="">VĹˇetci ÄŤlenovia</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.first_name} {member.last_name}
                  {member.member_number ? ` (${member.member_number})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary" size="sm">FiltrovaĹĄ</Button>

            {memberId && (
              <Link href="/gear/assignments" className="text-sm text-gray-500 hover:text-[#C62828]">
                Zrušiť
              </Link>
            )}
          </div>
        </div>
      </form>

      {assignments.length === 0 ? (
        <EmptyState
          title="Ĺ˝iadne priradenia"
          description={
            selectedMember
              ? "Tento ÄŤlen momentĂˇlne nemĂˇ priradenĂş Ĺľiadnu techniku."
              : "ZatiaÄľ nebola vydanĂˇ Ĺľiadna technika."
          }
        />
      ) : (
        <div className="space-y-3">
          {assignments.map((a: AssignmentWithDetails) => (
            <div
              key={a.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/gear/${a.equipment_id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-[#C62828]"
                    >
                      {a.equipment?.name ?? `PoloĹľka #${a.equipment_id.slice(0, 8)}`}
                    </Link>
                    {a.equipment?.inventory_number && (
                      <span className="text-xs text-gray-500">
                        ({a.equipment.inventory_number})
                      </span>
                    )}
                    {a.returned_at ? (
                      <Badge tone="gray">VrĂˇtenĂ©</Badge>
                    ) : (
                      <Badge tone="blue">AktĂ­vne</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {a.member
                      ? `${a.member.first_name} ${a.member.last_name}${a.member.member_number ? ` (${a.member.member_number})` : ""}`
                      : "NeznĂˇmy ÄŤlen"}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    VydanĂ©: {new Date(a.assigned_at).toLocaleDateString("sk-SK")}
                    {a.returned_at
                      ? ` Â· vrĂˇtenĂ©: ${new Date(a.returned_at).toLocaleDateString("sk-SK")}`
                      : ""}
                    {a.condition_on_assign
                      ? ` Â· stav: ${CONDITION_LABELS[a.condition_on_assign] ?? a.condition_on_assign}`
                      : ""}
                  </p>
                  {a.notes && <p className="mt-1 text-sm text-gray-700">{a.notes}</p>}
                </div>
                {canEdit && !a.returned_at && (
                  <form action={returnGearAction} className="flex items-center gap-2">
                    <input type="hidden" name="assignment_id" value={a.id} />
                    <input type="hidden" name="equipment_id" value={a.equipment_id} />
                    <select
                      name="condition_on_return"
                      defaultValue=""
                      aria-label="Stav pri nĂˇvrate"
                      className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
                    >
                      <option value="">Stavâ€¦</option>
                      {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <Button type="submit" variant="secondary" size="sm">
                      <Undo2 className="h-4 w-4" /> VrĂˇtiĹĄ
                    </Button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
