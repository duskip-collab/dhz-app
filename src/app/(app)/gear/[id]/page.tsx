import { ArrowLeft, Pencil, Trash2, UserPlus, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getEquipmentById } from "@/lib/equipment/equipment.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { deleteGearItemAction, returnGearAction } from "../actions";

const STATUS_LABELS: Record<string, { label: string; tone: "green" | "blue" | "yellow" | "red" | "gray" }> = {
  AVAILABLE: { label: "DostupnĂ©", tone: "green" },
  IN_SERVICE: { label: "V sluĹľbe", tone: "blue" },
  RESERVED: { label: "RezervovanĂ©", tone: "yellow" },
  DAMAGED: { label: "PoĹˇkodenĂ©", tone: "red" },
  DISPOSED: { label: "VyradenĂ©", tone: "gray" },
};

const CONDITION_LABELS: Record<string, string> = {
  NEW: "NovĂ©",
  GOOD: "DobrĂ©",
  FAIR: "PouĹľitĂ©",
  POOR: "OpotrebovanĂ©",
  UNSERVICEABLE: "NeschopnĂ© sluĹľby",
};

const MAINT_TYPE_LABELS: Record<string, string> = {
  STK_EK: "STK/EK",
  REVISION: "RevĂ­zia",
  SERVICE_CHECK: "ServisnĂˇ kontrola",
  REPAIR: "Oprava",
  INSPECTION: "Kontrola",
};

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <span className="text-xs font-semibold text-gray-500 uppercase">{label}</span>
      <p className="mt-0.5 text-sm text-gray-900">{value ?? "â€”"}</p>
    </div>
  );
}

export default async function GearDetailPage({
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

  const canEdit = hasPermission(ctx.permissions, PERMISSIONS.INVENTORY_EDIT);
  const statusCfg = STATUS_LABELS[item.status] ?? { label: item.status, tone: "gray" as const };
  const returnWithAssignment = returnGearAction;

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
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{item.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
            <Badge tone="gray">{CONDITION_LABELS[item.condition] ?? item.condition}</Badge>
            {item.category && <Badge tone="blue">{item.category.name}</Badge>}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/gear/${item.id}/assign`}>
              <Button variant="secondary" size="sm">
                <UserPlus className="h-4 w-4" /> PriradiĹĄ
              </Button>
            </Link>
            <Link href={`/gear/${item.id}/maintenance`}>
              <Button variant="secondary" size="sm">
                <Wrench className="h-4 w-4" /> ĂšdrĹľba
              </Button>
            </Link>
            <Link href={`/gear/${item.id}/edit`}>
              <Button variant="secondary" size="sm">
                <Pencil className="h-4 w-4" /> UpraviĹĄ
              </Button>
            </Link>
            <form action={deleteGearItemAction}>
              <input type="hidden" name="equipment_id" value={item.id} />
              <Button type="submit" variant="danger" size="sm">
                <Trash2 className="h-4 w-4" /> VymazaĹĄ
              </Button>
            </form>
          </div>
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


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-900 mb-4">ZĂˇkladnĂ© informĂˇcie</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="InventĂˇrne ÄŤĂ­slo" value={item.inventory_number} />
              <Field label="SĂ©riovĂ© ÄŤĂ­slo" value={item.serial_number} />
              <Field label="Umiestnenie" value={item.location} />
              <Field
                label="DĂˇtum nĂˇkupu"
                value={
                  item.purchase_date
                    ? new Date(item.purchase_date).toLocaleDateString("sk-SK")
                    : null
                }
              />
              <Field
                label="Cena nĂˇkupu"
                value={item.purchase_price != null ? `${item.purchase_price.toFixed(2)} â‚¬` : null}
              />
              <Field
                label="ÄŽalĹˇia kontrola"
                value={
                  item.next_inspection_date
                    ? new Date(item.next_inspection_date).toLocaleDateString("sk-SK")
                    : null
                }
              />
            </div>
            {item.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase">PoznĂˇmky</span>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{item.notes}</p>
              </div>
            )}
          </section>

          {item.vehicle_details && (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-base font-bold text-gray-900 mb-4">Ăšdaje vozidla</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="SPZ / EÄŚV" value={item.vehicle_details.license_plate} />
                <Field label="VIN" value={item.vehicle_details.vin} />
                <Field label="Palivo" value={item.vehicle_details.fuel_type} />
                <Field
                  label="Stav km"
                  value={item.vehicle_details.mileage_km?.toLocaleString("sk-SK")}
                />
                <Field
                  label="Motohodiny"
                  value={item.vehicle_details.engine_hours?.toLocaleString("sk-SK")}
                />
                <Field
                  label="STK platnĂˇ do"
                  value={
                    item.vehicle_details.stk_valid_until
                      ? new Date(item.vehicle_details.stk_valid_until).toLocaleDateString("sk-SK")
                      : null
                  }
                />
                <Field
                  label="EK platnĂˇ do"
                  value={
                    item.vehicle_details.ek_valid_until
                      ? new Date(item.vehicle_details.ek_valid_until).toLocaleDateString("sk-SK")
                      : null
                  }
                />
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section
            className={`rounded-xl border p-5 ${
              item.current_assignment
                ? "bg-blue-50 border-blue-200"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <h2 className="text-base font-bold text-gray-900 mb-3">Priradenie</h2>
            {item.current_assignment ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">ÄŚlen</span>
                    <p className="mt-0.5 font-medium text-gray-900">
                      {item.current_assignment.member?.first_name}{" "}
                      {item.current_assignment.member?.last_name}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">ÄŚĂ­slo ÄŤlena</span>
                    <p className="mt-0.5 text-gray-900">
                      {item.current_assignment.member?.member_number ?? "â€”"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">Od</span>
                    <p className="mt-0.5 text-gray-900">
                      {new Date(item.current_assignment.assigned_at).toLocaleDateString("sk-SK")}
                    </p>
                  </div>
                  {item.current_assignment.condition_on_assign && (
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase">Stav</span>
                      <p className="mt-0.5 text-gray-900">
                        {CONDITION_LABELS[item.current_assignment.condition_on_assign] ??
                          item.current_assignment.condition_on_assign}
                      </p>
                    </div>
                  )}
                </div>
                {item.current_assignment.notes && (
                  <p className="text-sm text-gray-700">{item.current_assignment.notes}</p>
                )}
                {canEdit && (
                  <form action={returnWithAssignment} className="pt-2 border-t border-blue-100">
                    <input
                      type="hidden"
                      name="assignment_id"
                      value={item.current_assignment.id}
                    />
                    <input type="hidden" name="equipment_id" value={item.id} />
                    <label
                      htmlFor="condition_on_return"
                      className="block text-xs font-semibold text-gray-500 uppercase mb-1"
                    >
                      Stav pri nĂˇvrate
                    </label>
                    <select
                      id="condition_on_return"
                      name="condition_on_return"
                      defaultValue=""
                      className="w-full mb-2 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
                    >
                      <option value="">Bez zmeny</option>
                      {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <Button type="submit" variant="secondary" size="sm">
                      OznaÄŤiĹĄ ako vrĂˇtenĂ©
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">PoloĹľka nie je nikomu priradenĂˇ.</p>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900">Údržba</h2>
              {canEdit && (
                <Link
                  href={`/gear/${item.id}/maintenance`}
                  className="text-sm text-[#C62828] hover:underline"
                >
                  Zobraziť všetko →
                </Link>
              )}
            </div>
            {item.recent_maintenance.length === 0 ? (
              <p className="text-sm text-gray-500">Zatiaľ žiadne záznamy údržby.</p>
            ) : (
              <ul className="space-y-3">
                {item.recent_maintenance.map((log) => (
                  <li key={log.id} className="border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{log.title}</p>
                      <Badge tone={log.status === "PLANNED" ? "yellow" : "green"}>
                        {MAINT_TYPE_LABELS[log.type] ?? log.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(log.performed_at).toLocaleDateString("sk-SK")}
                      {log.next_due_date
                        ? ` · najbližšie ${new Date(log.next_due_date).toLocaleDateString("sk-SK")}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

