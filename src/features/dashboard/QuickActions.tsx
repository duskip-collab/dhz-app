import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  Dumbbell,
  FileText,
  Trophy,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PERMISSIONS } from "@/lib/auth/permissions";

const ACTIONS = [
  { label: "Pridať člena", href: "/members", icon: Users, permission: PERMISSIONS.MEMBERS_CREATE },
  { label: "Pridať tréning", href: "/training", icon: Dumbbell, permission: PERMISSIONS.TRAINING_CREATE },
  { label: "Pridať súťaž", href: "/competitions", icon: Trophy, permission: PERMISSIONS.COMPETITION_CREATE },
  { label: "Pridať poradu", href: "/meetings", icon: ClipboardList, permission: PERMISSIONS.CALENDAR_MANAGE },
  { label: "Nahlásiť poruchu", href: "/faults", icon: AlertTriangle, permission: PERMISSIONS.FAULT_CREATE },
  { label: "Pridať dokument", href: "/documents", icon: FileText, permission: PERMISSIONS.DOCUMENTS_UPLOAD },
];

export function QuickActions({ permissions }: { permissions: readonly string[] }) {
  const visibleActions = ACTIONS.filter(
    (action) => !action.permission || permissions.includes(action.permission),
  );

  if (visibleActions.length === 0) return null;

  return (
    <Card title="Rýchle akcie" subtitle="DEMO – vedú na placeholder modulu">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visibleActions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.label}
              href={a.href}
              className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-red-200 hover:bg-red-50/40 transition text-center sm:text-left min-h-[64px]"
            >
              <span className="w-9 h-9 rounded-lg bg-red-50 text-[#C62828] flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </span>
              <span className="text-sm font-medium text-gray-800 leading-tight">{a.label}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
