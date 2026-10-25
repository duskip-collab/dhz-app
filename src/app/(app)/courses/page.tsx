import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getTrainings, type Training } from "@/lib/training/training.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

const TRAINING_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Plánovaný",
  IN_PROGRESS: "Prebieha",
  COMPLETED: "Dokončený",
  CANCELLED: "Zrušený",
};

export default async function CoursesPage() {
  const ctx = await requirePermission(PERMISSIONS.TRAINING_VIEW);
  const canManage = hasPermission(ctx.permissions, PERMISSIONS.TRAINING_EDIT);

  let trainings: Training[] = [];
  try {
    trainings = await getTrainings({ limit: 20 });
  } catch {
    trainings = [];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-6 w-6 text-[#C62828]" />
        <h1 className="text-2xl font-bold text-gray-900">Kurzy a školenia</h1>
      </div>

      {canManage && (
        <Link href="/training">
          <Button variant="primary" size="sm">+ Nové školenie</Button>
        </Link>
      )}

      {trainings.length === 0 ? (
        <EmptyState title="Žiadne školenia" description="Zatiaľ nie sú naplánované žiadne kurzy ani školenia." />
      ) : (
        <div className="space-y-4">
          {trainings.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{t.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{t.description ?? ""}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {t.start_time && new Date(t.start_time).toLocaleDateString("sk-SK")}
                    {t.location && ` · ${t.location}`}
                  </p>
                </div>
                <Badge tone={t.status === "COMPLETED" ? "green" : t.status === "CANCELLED" ? "gray" : "blue"}>
                  {TRAINING_STATUS_LABELS[t.status] ?? t.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
