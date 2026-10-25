import { ArrowLeft, Pencil, Trash2, UserPlus, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getEquipmentById, getEquipmentPhotoUrl, getItemAssignmentHistory, type EquipmentAssignment } from "@/lib/equipment/equipment.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { deleteGearItemAction, returnGearAction } from "../actions";
import { uploadEquipmentPhotoAction } from "../../inventory/actions";
import { EquipmentPhotoUpload } from "@/features/equipment/components/EquipmentPhotoUpload";

const STATUS_LABELS: Record<string, { label: string; tone: "green" | "blue" | "yellow" | "red" | "gray" }> = {
  AVAILABLE: { label: "Dostupné", tone: "green" },
  IN_SERVICE: { label: "V službe", tone: "blue" },
  RESERVED: { label: "Rezervované", tone: "yellow" },
  DAMAGED: { label: "Poškodené", tone: "red" },
  DISPOSED: { label: "Vyradené", tone: "gray" },
};

const CONDITION_LABELS: Record<string, string> = {
  NEW: "Nové",
  GOOD: "Dobré",
  FAIR: "Použité",
  POOR: "Opotrebované",
  UNSERVICEABLE: "Neschopné služby",
};

const MAINT_TYPE_LABELS: Record<string, string> = {
  STK_EK: "STK/EK",
  REVISION: "Revízia",
  SERVICE_CHECK: "Servisná kontrola",
  REPAIR: "Oprava",
  INSPECTION: "Kontrola",
};

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <span className="text-xs font-semibold text-gray-500 uppercase">{label}</span>
      <p className="mt-0.5 text-sm text-gray-900">{value ?? "—"}</p>
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

  // História priradení položky (pre OOPP a výstroj – ktorí členovia majú daný kus).
  let assignmentHistory: EquipmentAssignment[] = [];
  try {
    assignmentHistory = await getItemAssignmentHistory(id);
  } catch {
    assignmentHistory = [];
  }

  // Fotografia položky (signed URL)
  let photoUrl: string | null = null;
  if (item.photo_path) {
    try {
      photoUrl = await getEquipmentPhotoUrl(item.photo_path);
    } catch {
      photoUrl = null;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/gear"
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#C62828]"
          >
            <ArrowLeft className="h-4 w-4" /> Späť na inventár
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{item.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={statusCfg.tone}>{statusCfg.label}</Badge>
            <Badge tone="gray">{CONDITION_LABELS[item.condition] ?? item.condition}</Badge>
            {item.category && <Badge tone="blue">{item.category.name}</Badge>}
            <Badge tone="gray">{item.quantity ?? 1} ks</Badge>
            {item.is_opp ? <Badge tone="yellow">OOPP</Badge> : null}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/gear/${item.id}/assign`}>
              <Button variant="secondary" size="sm">
                <UserPlus className="h-4 w-4" /> Priradiť
              </Button>
            </Link>
            <Link href={`/gear/${item.id}/maintenance`}>
              <Button variant="secondary" size="sm">
                <Wrench className="h-4 w-4" /> Údržba
              </Button>
            </Link>
            <Link href={`/gear/${item.id}/edit`}>
              <Button variant="secondary" size="sm">
                <Pencil className="h-4 w-4" /> Upraviť
              </Button>
            </Link>
            <form action={deleteGearItemAction}>
              <input type="hidden" name="equipment_id" value={item.id} />
              <Button type="submit" variant="danger" size="sm">
                <Trash2 className="h-4 w-4" /> Vymazať
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
            <h2 className="text-base font-bold text-gray-900 mb-4">Základné informácie</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Inventárne číslo" value={item.inventory_number} />
              <Field label="Sériové číslo" value={item.serial_number} />
              <Field label="Umiestnenie" value={item.location} />
              <Field
                label="Dátum nákupu"
                value={
                  item.purchase_date
                    ? new Date(item.purchase_date).toLocaleDateString("sk-SK")
                    : null
                }
              />
              <Field
                label="Cena nákupu"
                value={item.purchase_price != null ? `${item.purchase_price.toFixed(2)} €` : null}
              />
              <Field
                label="Ďalšia kontrola"
                value={
                  item.next_inspection_date
                    ? new Date(item.next_inspection_date).toLocaleDateString("sk-SK")
                    : null
                }
              />
            </div>
            {item.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase">Poznámky</span>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{item.notes}</p>
              </div>
            )}
          </section>

          {item.vehicle_details && (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-base font-bold text-gray-900 mb-4">Údaje vozidla</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="SPZ / EČV" value={item.vehicle_details.license_plate} />
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
                  label="STK platná do"
                  value={
                    item.vehicle_details.stk_valid_until
                      ? new Date(item.vehicle_details.stk_valid_until).toLocaleDateString("sk-SK")
                      : null
                  }
                />
                <Field
                  label="EK platná do"
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
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-900 mb-3">Fotografia</h2>
            {canEdit ? (
              <EquipmentPhotoUpload
                action={uploadEquipmentPhotoAction.bind(null, item.id)}
                currentPhotoUrl={photoUrl}
              />
            ) : photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={item.name}
                className="h-48 w-full rounded-lg border border-gray-200 object-cover"
              />
            ) : (
              <p className="text-sm text-gray-500">Fotografia nie je k dispozícii.</p>
            )}
          </section>
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
                    <span className="text-xs font-semibold text-gray-500 uppercase">Člen</span>
                    <p className="mt-0.5 font-medium text-gray-900">
                      {item.current_assignment.member?.first_name}{" "}
                      {item.current_assignment.member?.last_name}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">Číslo člena</span>
                    <p className="mt-0.5 text-gray-900">
                      {item.current_assignment.member?.member_number ?? "—"}
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
                      Stav pri návrate
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
                      Označiť ako vrátené
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Položka nie je nikomu priradená.</p>
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

      {/* Pridelení členovia – najmä pre OOPP / výstroj */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">
            Pridelení členovia
          </h2>
          {item.is_opp && <Badge tone="yellow">OOPP – evidenčná súčasť</Badge>}
        </div>
        {assignmentHistory.length === 0 ? (
          <p className="text-sm text-gray-500">
            Táto položka nie je a ani nebola pridelená žiadnemu členovi.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {assignmentHistory.map((a) => (
              <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {a.member
                        ? `${a.member.first_name} ${a.member.last_name}${
                            a.member.member_number ? ` (${a.member.member_number})` : ""
                          }`
                        : "Neznámy člen"}
                    </p>
                    <p className="text-xs text-gray-500">
                      Pridelené: {new Date(a.assigned_at).toLocaleDateString("sk-SK")}
                      {a.condition_on_assign
                        ? ` · stav pri pridelení: ${
                            CONDITION_LABELS[a.condition_on_assign] ?? a.condition_on_assign
                          }`
                        : ""}
                      {a.returned_at
                        ? ` · vrátené: ${new Date(a.returned_at).toLocaleDateString("sk-SK")}`
                        : ""}
                    </p>
                    {(a.member as { phone?: string | null } | undefined)?.phone && (
                      <p className="text-xs text-gray-400">
                        Tel: {(a.member as { phone?: string | null }).phone}
                      </p>
                    )}
                  </div>
                  {a.returned_at ? (
                    <Badge tone="gray">Vrátené</Badge>
                  ) : (
                    <Badge tone="green">Aktívne pridelené</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

