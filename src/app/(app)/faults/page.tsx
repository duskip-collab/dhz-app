import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { requireAnyPermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getFaults, reportFault, updateFault, deleteFault } from "@/lib/equipment/faults.service";
import { getEquipmentItems } from "@/lib/equipment/equipment.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSearchParams, useNavigate } from "next/navigation";

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

const STATUS_COLORS: Record<string, "green" | "yellow" | "red" | "blue" | "gray"> = {
  REPORTED: "gray",
  TRIAGED: "blue",
  IN_PROGRESS: "orange",
  RESOLVED: "green",
  CLOSED: "gray",
};

const STATUS_ORDER: Record<string, number> = {
  REPORTED: 1,
  TRIAGED: 2,
  IN_PROGRESS: 3,
  RESOLVED: 4,
  CLOSED: 5,
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

  // Calculate counters from all faults
  const totalFaults = faults.length;
  const reportedCount = faults.filter((f) => f.status === "REPORTED").length;
  const triagedCount = faults.filter((f) => f.status === "TRIAGED").length;
  const inProgressCount = faults.filter((f) => f.status === "IN_PROGRESS").length;
  const resolvedCount = faults.filter((f) => f.status === "RESOLVED").length;
  const closedCount = faults.filter((f) => f.status === "CLOSED").length;
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

