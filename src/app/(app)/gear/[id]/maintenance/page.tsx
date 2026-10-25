import { ArrowLeft, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getEquipmentById,
  getMaintenanceLogs,
  type MaintenanceLog,
} from "@/lib/equipment/equipment.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { addMaintenanceLogAction } from "../../actions";

const MAINT_TYPE_LABELS: Record<MaintenanceLog["type"], string> = {
  STK_EK: "STK/EK",
  REVISION: "Revízia",
  SERVICE_CHECK: "Servisná kontrola",
  REPAIR: "Oprava",
  INSPECTION: "Kontrola",
};

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white";

export default async function GearMaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;

  const ctx = await requirePermission(PERMISSIONS.INVENTORY_VIEW);

  let item;
  try {
    item = await getEquipmentById(id);
  } catch (e) {
    if (typeof e === "object" && e !== null && "status" in e && (e as { status: number }).status === 404) {
      notFound();
    }
    throw e;
  }

  const logs = await getMaintenanceLogs(id);
  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.INVENTORY_EDIT);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href={`/gear/${item.id}`}
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
          >
            <ArrowLeft className="h-4 w-4" /> Späť na detail
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Údržba — {item.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Kompletná história kontrol, servisov a opráv.
          </p>
        </div>
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

      {canEdit && (
        <form
          action={addMaintenanceLogAction}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
        >
          <h2 className="text-base font-bold text-gray-900 mb-4">Nový záznam údržby</h2>
          <input type="hidden" name="equipment_id" value={item.id} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="m-type" className="block text-sm font-medium text-gray-700 mb-1">
                Typ *
              </label>
              <select id="m-type" name="type" required className={inputCls}>
                {Object.entries(MAINT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="m-title" className="block text-sm font-medium text-gray-700 mb-1">
                Názov *
              </label>
              <input
                id="m-title"
                name="title"
                required
                className={inputCls}
                placeholder="Napr. Výmena oleja"
              />
            </div>
            <div>
              <label htmlFor="m-performed_at" className="block text-sm font-medium text-gray-700 mb-1">
                Dátum vykonania *
              </label>
              <input
                id="m-performed_at"
                name="performed_at"
                type="date"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="m-next_due_date" className="block text-sm font-medium text-gray-700 mb-1">
                Ďalší termín
              </label>
              <input
                id="m-next_due_date"
                name="next_due_date"
                type="date"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="m-cost" className="block text-sm font-medium text-gray-700 mb-1">
                Náklady (€)
              </label>
              <input
                id="m-cost"
                name="cost"
                type="number"
                step="0.01"
                min="0"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="m-status" className="block text-sm font-medium text-gray-700 mb-1">
                Stav
              </label>
              <select id="m-status" name="status" defaultValue="COMPLETED" className={inputCls}>
                <option value="COMPLETED">Vykonané</option>
                <option value="PLANNED">Plánované</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="m-description" className="block text-sm font-medium text-gray-700 mb-1">
                Popis
              </label>
              <textarea
                id="m-description"
                name="description"
                rows={3}
                className={inputCls}
                placeholder="Podrobnosti o vykonanej údržbe…"
              />
            </div>
          </div>
          <div className="mt-4">
            <Button type="submit" variant="primary" size="sm">
              <Wrench className="h-4 w-4" /> Pridať záznam
            </Button>
          </div>
        </form>
      )}

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4">História údržby</h2>
        {logs.length === 0 ? (
          <EmptyState
            title="Žiadne záznamy údržby"
            description="Pridajte prvý záznam pomocou formulára vyššie."
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {logs.map((log) => (
              <li key={log.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{log.title}</p>
                      <Badge tone="blue">{MAINT_TYPE_LABELS[log.type] ?? log.type}</Badge>
                      <Badge tone={log.status === "PLANNED" ? "yellow" : "green"}>
                        {log.status === "PLANNED" ? "Plánované" : "Vykonané"}
                      </Badge>
                    </div>
                    {log.description && (
                      <p className="mt-1 text-sm text-gray-600">{log.description}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Vykonané: {new Date(log.performed_at).toLocaleDateString("sk-SK")}
                      {log.next_due_date
                        ? ` · najbližší termín: ${new Date(log.next_due_date).toLocaleDateString("sk-SK")}`
                        : ""}
                      {log.cost > 0 ? ` · náklady: ${log.cost.toFixed(2)} €` : ""}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
