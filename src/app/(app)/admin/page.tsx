import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  loadAdminOverview,
  type AdminMemberRow,
  type AdminUserRole,
  type AdminUserPermission,
} from "@/lib/admin/admin.service";
import { Card } from "@/components/ui/Card";
import { ShieldCheck } from "lucide-react";
import AdminClientView from "./AdminClientView";

type AdminOverview = {
  members: AdminMemberRow[];
  userRoles: AdminUserRole[];
  userPermissions: AdminUserPermission[];
};

export default async function AdminPage() {
  await requirePermission(PERMISSIONS.ADMIN_USERS);

  let overview: AdminOverview | null = null;
  try {
    overview = await loadAdminOverview();
  } catch {
    overview = null;
  }

  if (!overview) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-[#C62828]" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Administrácia</h1>
            <p className="text-sm text-gray-500">
              Správa členov, ról, oprávnení a prístupových kódov.
            </p>
          </div>
        </div>
        <Card className="p-6 border border-red-200 bg-red-50">
          <h2 className="text-base font-bold text-[#C62828]">Chyba pri načítavaní prehľadu</h2>
          <p className="text-sm text-gray-600 mt-1">
            Skontrolujte prihlásenie a oprávnenia (ADMIN / VELITEL).
          </p>
        </Card>
      </div>
    );
  }

  return <AdminClientView overview={overview} />;
}
