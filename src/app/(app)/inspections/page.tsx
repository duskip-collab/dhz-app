import { Wrench } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getInspections, getUpcomingInspections } from "@/lib/equipment/inspections.service";
import { getEquipmentItems } from "@/lib/equipment/equipment.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { createInspectionAction, updateInspectionAction, deleteInspectionAction } from "./actions";

const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] bg-white";
const TYPE = { STK: "STK", EK: "EK", REVISION: "Revízia", PERIODIC_CHECK: "Kontrola", SERVICE: "Servis" };
const STATUS = { PLANNED: "Plánovaná", SCHEDULED: "Uskutočnená", IN_PROGRESS: "Prebieha", COMPLETED: "Dokončená", OVERDUE: "Prekonaná", CANCELLED: "Zrušená" };

export default async function InspectionsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requirePermission(PERMISSIONS.INSPECTION_VIEW);
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const success = typeof params.success === "string" ? params.success : undefined;
  const openOnly = params.open === "1";
  const [inspections, upcoming, items] = await Promise.all([getInspections({ upcoming: !openOnly }), getUpcomingInspections(60), getEquipmentItems()]);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Revízie a údržba</h1></div>
      {error && <div className="p-4 bg-red-50 text-red-800 rounded">{error}</div>}
      {success && <div className="p-4 bg-green-50 text-green-800 rounded">{success}</div>}

      <section className="bg-white p-5 rounded-lg border">
        <h2 className="font-bold mb-4">Termíny</h2>
        <ul className="space-y-2">{upcoming.map(i => <li key={i.id}><p>{i.title}</p><p className="text-xs text-gray-600">{TYPE[i.type]}</p></li>)}</ul>
      </section>

      <form action={createInspectionAction} className="bg-white p-5 rounded-lg border">
        <h2 className="font-bold mb-4">Naplánovať</h2>
        <select name="equipment_id" required className={inputCls}>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <select name="type" required className={inputCls + " mt-2"}><option value="STK">STK</option><option value="REVISION">Revízia</option></select>
        <input name="title" required className={inputCls + " mt-2"} />
        <input name="scheduled_date" type="date" className={inputCls + " mt-2"} />
        <div className="mt-4"><Button type="submit" variant="primary" size="sm">Naplánovať</Button></div>
      </form>

      <section className="bg-white p-5 rounded-lg border">
        <h2 className="font-bold mb-4">Revízie</h2>
        <ul className="space-y-2">
          {inspections.map(i => (
            <li key={i.id} className="p-3 border rounded flex justify-between">
              <div><p className="font-medium">{i.title}</p><p className="text-xs text-gray-600">{TYPE[i.type]}</p></div>
              <div className="flex gap-1">
                <form action={updateInspectionAction} className="flex gap-1">
                  <input type="hidden" name="inspection_id" value={i.id} />
                  <select name="status" defaultValue={i.status} className="px-2 py-1 text-xs border rounded"><option value="PLANNED">Plán</option><option value="COMPLETED">OK</option></select>
                  <Button type="submit" variant="secondary" size="sm">Ulož</Button>
                </form>
                <form action={deleteInspectionAction}><input type="hidden" name="inspection_id" value={i.id} /><Button type="submit" variant="danger" size="sm">X</Button></form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
