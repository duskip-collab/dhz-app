import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getInventoryCheckById } from "@/lib/equipment/inventories.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { updateInventoryCheckAction, verifyInventoryItemAction, deleteInventoryCheckAction } from "../actions";

const STATUS_LABELS = { DRAFT: "Náčrt", IN_PROGRESS: "Prebieha", COMPLETED: "Hotovo", CANCELLED: "Zrušená" };
const STATUS_TONE = { DRAFT: "blue", IN_PROGRESS: "yellow", COMPLETED: "green", CANCELLED: "gray" };

export default async function InventoryCheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);

  let check;
  try {
    check = await getInventoryCheckById(id);
  } catch (err) {
    return (
      <div className="space-y-6">
        <Link href="/inventories"><Button variant="secondary" size="sm">← Späť</Button></Link>
        <EmptyState title="Kontrola nenájdená" description="Požadovaná inventarizačná kontrola neexistuje." />
      </div>
    );
  }

  const progressPercent = check.total > 0 ? Math.round((check.verified / check.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <Link href="/inventories"><Button variant="secondary" size="sm">← Späť</Button></Link>
          <h1 className="mt-3 text-2xl font-bold">{check.title}</h1>
          <p className="text-sm text-gray-500">{check.description}</p>
          <div className="mt-2 flex gap-2">
            <Badge tone={STATUS_TONE[check.status]}>{STATUS_LABELS[check.status]}</Badge>
            <span className="text-xs text-gray-500">{check.created_at ? new Date(check.created_at).toLocaleDateString("sk-SK") : "—"}</span>
          </div>
        </div>
        {check.status !== "CANCELLED" && (
          <form action={deleteInventoryCheckAction}>
            <input type="hidden" name="check_id" value={check.id} />
            <Button type="submit" variant="danger" size="sm">Zmazať</Button>
          </form>
        )}
      </div>

      <section className="bg-white p-5 rounded-lg border">
        <h2 className="font-bold mb-4">Priebeh</h2>
        <div className="space-y-2">
          <div className="flex justify-between"><span>Overené:</span><strong>{check.verified}/{check.total}</strong></div>
          <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progressPercent}%` }}></div></div>
          <div className="text-xs text-gray-600 grid grid-cols-3 gap-2">
            <div>Nájdené: <strong>{check.found_count}</strong></div>
            <div>Chýbajúce: <strong>{check.missing_count}</strong></div>
            <div>Nekontrolované: <strong>{check.total - check.verified}</strong></div>
          </div>
        </div>
      </section>

      {check.items.length === 0 ? (
        <EmptyState title="Žiadne položky" description="Formulár je prázdny." />
      ) : (
        <section className="bg-white p-5 rounded-lg border">
          <h2 className="font-bold mb-4">Položky ({check.items.length})</h2>
          <ul className="space-y-3">
            {check.items.map((item) => (
              <li key={item.id} className="p-3 border rounded-lg">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{item.equipment?.name}</p>
                    <p className="text-xs text-gray-500">{item.equipment?.inventory_number}</p>
                    {item.found !== null && (
                      <div className="mt-2">
                        <Badge tone={item.found ? "green" : "red"}>{item.found ? "Nájdené" : "Chýba"}</Badge>
                        {item.condition_found && <span className="text-xs text-gray-600 ml-2">Stav: {item.condition_found}</span>}
                        {item.notes && <p className="text-xs text-gray-600 mt-1">Poznámka: {item.notes}</p>}
                      </div>
                    )}
                  </div>
                  {item.found === null && (
                    <form action={verifyInventoryItemAction} className="flex flex-col gap-2 shrink-0">
                      <input type="hidden" name="check_id" value={check.id} />
                      <input type="hidden" name="equipment_id" value={item.equipment_id} />
                      <select name="found" required className="px-2 py-1 text-xs border rounded-lg bg-white">
                        <option value="">Vyberte...</option>
                        <option value="true">Nájdené</option>
                        <option value="false">Chýba</option>
                      </select>
                      <input name="condition_found" placeholder="Stav" className="px-2 py-1 text-xs border rounded-lg" />
                      <input name="notes" placeholder="Poznámka" className="px-2 py-1 text-xs border rounded-lg" />
                      <Button type="submit" variant="primary" size="sm">Potvrdiť</Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
