import { ArrowLeft, UserPlus } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getEquipmentItems } from "@/lib/equipment/equipment.service";
import { listMembers } from "@/lib/members/members.service";
import { Button } from "@/components/ui/Button";
import { assignGearAction } from "../actions";

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white";

const CONDITION_OPTIONS = [
  { value: "NEW", label: "Nové" },
  { value: "GOOD", label: "Dobré" },
  { value: "FAIR", label: "Použité" },
  { value: "POOR", label: "Opotrebované" },
  { value: "UNSERVICEABLE", label: "Neschopné služby" },
];

export default async function GearAssignPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const preselectedId = typeof sp.equipment_id === "string" ? sp.equipment_id : undefined;

  const [items, members] = await Promise.all([getEquipmentItems(), listMembers()]);
  const selectedItem = preselectedId
    ? items.find((i) => i.id === preselectedId) ?? null
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/gear"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
        >
          <ArrowLeft className="h-4 w-4" /> Späť na inventár
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Priradiť techniku členovi</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vydajte položku výstroja alebo techniky konkrétnemu členovi.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <form
        action={assignGearAction}
        className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4"
      >
        {selectedItem ? (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase">Vybraná položka</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {selectedItem.name}
              {selectedItem.inventory_number ? ` (${selectedItem.inventory_number})` : ""}
            </p>
            <input type="hidden" name="equipment_id" value={selectedItem.id} />
          </div>
        ) : (
          <div>
            <label htmlFor="equipment_id" className="block text-sm font-medium text-gray-700 mb-1">
              Položka *
            </label>
            <select
              id="equipment_id"
              name="equipment_id"
              required
              className={inputCls}
            >
              <option value="" disabled>Vyberte položku</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.inventory_number ? ` (${item.inventory_number})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="member_id" className="block text-sm font-medium text-gray-700 mb-1">
            Člen *
          </label>
          <select id="member_id" name="member_id" required className={inputCls}>
            <option value="" disabled>Vyberte člena</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.first_name} {member.last_name}
                {member.member_number ? ` (${member.member_number})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="condition_on_assign"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Stav pri priradení
          </label>
          <select
            id="condition_on_assign"
            name="condition_on_assign"
            defaultValue=""
            className={inputCls}
          >
            <option value="">Bez zmeny</option>
            {CONDITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Poznámka
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className={inputCls}
            placeholder="Voliteľné poznámky k priradeniu…"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" variant="primary">
            <UserPlus className="h-4 w-4" /> Priradiť
          </Button>
          <Link href="/gear">
            <Button variant="secondary" type="button">Zrušiť</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
