import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { requireAnyPermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getFaults } from "@/lib/equipment/faults.service";
import { getEquipmentItems } from "@/lib/equipment/equipment.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { reportFaultAction, updateFaultAction, deleteFaultAction } from "./actions";

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white";

const SEV_TONE: Record<string, "green" | "yellow" | "red" | "blue" | "gray"> = {
  LOW: "green",
  MEDIUM: "yellow",
  HIGH: "red",
  CRITICAL: "red",
};

const STATUS_LABEL: Record<string, string> = {
  REPORTED: "Nahlásená",
  TRIAGED: "Preverená",
  IN_PROGRESS: "Rieši sa",
  RESOLVED: "Vyriešená",
  CLOSED: "Uzavretá",
};

export default async function FaultsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requireAnyPermission([PERMISSIONS.FAULT_CREATE, PERMISSIONS.FAULT_MANAGE]);
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const success = typeof params.success === "string" ? params.success : undefined;
  const openOnly = params.open === "1";

  const [faults, items] = await Promise.all([
    getFaults({ open_only: openOnly || undefined }),
    getEquipmentItems(),
  ]);
  const canManage = hasPermission(ctx.permissions, PERMISSIONS.FAULT_MANAGE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            <AlertTriangle className="h-4 w-4" /> Technika
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Poruchy</h1>
          <p className="mt-1 text-sm text-gray-500">Evidencia porúch techniky a ich riešenia.</p>
        </div>
        <Link href={openOnly ? "/faults" : "/faults?open=1"}>
          <Button variant="secondary" size="sm">
            {openOnly ? "Zobraziť všetky" : "Len otvorené"}
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">{success}</div>
      )}

      <form action={reportFaultAction} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4">Nahlásiť poruchu</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="f-equipment" className="block text-sm font-medium text-gray-700 mb-1">Technika *</label>
            <select id="f-equipment" name="equipment_id" required className={inputCls}>
              <option value="" disabled>Vyberte položku</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name}{i.inventory_number ? ` (${i.inventory_number})` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-title" className="block text-sm font-medium text-gray-700 mb-1">Názov poruchy *</label>
            <input id="f-title" name="title" required className={inputCls} placeholder="Napr. Nefunkčné čerpadlo" />
          </div>
          <div>
            <label htmlFor="f-severity" className="block text-sm font-medium text-gray-700 mb-1">Závažnosť</label>
            <select id="f-severity" name="severity" defaultValue="MEDIUM" className={inputCls}>
              <option value="LOW">Nízka</option>
              <option value="MEDIUM">Stredná</option>
              <option value="HIGH">Vysoká</option>
              <option value="CRITICAL">Kritická</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-priority" className="block text-sm font-medium text-gray-700 mb-1">Priorita</label>
            <select id="f-priority" name="priority" defaultValue="NORMAL" className={inputCls}>
              <option value="LOW">Nízka</option>
              <option value="NORMAL">Normálna</option>
              <option value="HIGH">Vysoká</option>
              <option value="URGENT">Urgentná</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="f-desc" className="block text-sm font-medium text-gray-700 mb-1">Popis</label>
            <textarea id="f-desc" name="description" rows={2} className={inputCls} />
          </div>
        </div>
        <div className="mt-4">
          <Button type="submit" variant="primary" size="sm">Nahlásiť poruchu</Button>
        </div>
      </form>

      {faults.length === 0 ? (
        <EmptyState title="Žiadne poruchy" description="Zatiaľ nebola nahlásená žiadna porucha." />
      ) : (
        <ul className="space-y-3">
          {faults.map((f) => (
            <li key={f.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                    <Badge tone={SEV_TONE[f.severity] ?? "gray"}>{f.severity}</Badge>
                    <Badge tone={f.status === "REPORTED" ? "yellow" : f.status === "CLOSED" || f.status === "RESOLVED" ? "green" : "blue"}>
                      {STATUS_LABEL[f.status] ?? f.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    <Link href={`/gear/${f.equipment_id}`} className="hover:text-[#C62828]">
                      {f.equipment?.name ?? "Neznáma technika"}
                    </Link>
                    {" · "}{new Date(f.created_at).toLocaleDateString("sk-SK")}
                  </p>
                  {f.description && <p className="mt-1 text-sm text-gray-700">{f.description}</p>}
                </div>
                {canManage && (
                  <div className="flex items-center gap-2 shrink-0">
                    <form action={updateFaultAction} className="flex items-center gap-2">
                      <input type="hidden" name="fault_id" value={f.id} />
                      <select name="status" defaultValue={f.status} aria-label="Stav" className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white">
                        {Object.entries(STATUS_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      <Button type="submit" variant="secondary" size="sm">Uložiť</Button>
                    </form>
                    <form action={deleteFaultAction}>
                      <input type="hidden" name="fault_id" value={f.id} />
                      <Button type="submit" variant="danger" size="sm">Zmazať</Button>
                    </form>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

