import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getInventoryChecks } from "@/lib/equipment/inventories.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { createInventoryCheckAction } from "./actions";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Nápad", IN_PROGRESS: "Prebieha", COMPLETED: "Hotovo", CANCELLED: "Zrušená" };
const STATUS_TONE: Record<string, "blue" | "yellow" | "green" | "gray"> = { DRAFT: "blue", IN_PROGRESS: "yellow", COMPLETED: "green", CANCELLED: "gray" };

export default async function InventoriesPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const success = typeof params.success === "string" ? params.success : undefined;
  const checks = await getInventoryChecks();

  return (
    <div className="space-y-6">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400"><ClipboardList className="h-4 w-4" /> Technika</p>
        <h1 className="mt-1 text-2xl font-bold">Inventarizácia</h1>
        <p className="mt-1 text-sm text-gray-500">Kontroly, fyzické overenie a protokoly.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">{success}</div>}

      <form action={createInventoryCheckAction} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4">Začať novú kontrolu</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input name="title" required className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white" placeholder="Názov *" />
          <textarea name="description" rows={2} className="md:col-span-2 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white" placeholder="Popis" />
        </div>
        <div className="mt-4"><Button type="submit" variant="primary" size="sm">Začať</Button></div>
      </form>

      {checks.length === 0 ? <EmptyState title="Žiadne kontroly" description="Začnite novú kontrolu." /> :
        <ul className="space-y-3">
          {checks.map(c => (
            <li key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex justify-between items-center">
              <div>
                <p className="font-semibold">{c.title}</p>
                <p className="text-xs text-gray-500 mt-1">{c.created_at ? new Date(c.created_at).toLocaleDateString("sk-SK") : "—"}</p>
                <Badge tone={STATUS_TONE[c.status] ?? "gray"}>{STATUS_LABEL[c.status]}</Badge>
              </div>
              <Link href={`/inventories/${c.id}`}><Button variant="secondary" size="sm">Prehliadať</Button></Link>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
