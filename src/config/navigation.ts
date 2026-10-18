import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  FileText,
  GraduationCap,
  Hammer,
  Home,
  MessageSquare,
  Package,
  Settings,
  Shirt,
  Trophy,
  Truck,
  Users,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission | readonly Permission[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavGroup[] = [
  {
    label: "Hlavné",
    items: [
      { label: "Domov", href: "/dashboard", icon: Home, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Kalendár", href: "/calendar", icon: CalendarDays, permission: PERMISSIONS.CALENDAR_VIEW },
      { label: "Oznámenia", href: "/announcements", icon: Bell, permission: PERMISSIONS.ANNOUNCEMENTS_VIEW },
    ],
  },
  {
    label: "Organizácia",
    items: [
      { label: "Členovia", href: "/members", icon: Users, permission: PERMISSIONS.MEMBERS_VIEW },
      { label: "Tréningy", href: "/training", icon: Dumbbell, permission: PERMISSIONS.TRAINING_VIEW },
      { label: "Súťaže", href: "/competitions", icon: Trophy, permission: PERMISSIONS.COMPETITION_VIEW },
      { label: "Porady", href: "/meetings", icon: ClipboardList, permission: PERMISSIONS.MEETINGS_VIEW },
      { label: "Brigády", href: "/brigades", icon: Hammer, permission: PERMISSIONS.WORK_PARTIES_VIEW },
    ],
  },
  {
    label: "Technika a majetok",
    items: [
      { label: "Inventár", href: "/inventory", icon: Package, permission: PERMISSIONS.INVENTORY_VIEW },
      { label: "Vozidlá", href: "/vehicles", icon: Truck, permission: PERMISSIONS.VEHICLE_VIEW },
      { label: "Výzbroj vozidiel", href: "/vehicle-equipment", icon: Wrench, permission: PERMISSIONS.VEHICLE_VIEW },
      { label: "Poruchy", href: "/faults", icon: AlertTriangle, permission: [PERMISSIONS.FAULT_CREATE, PERMISSIONS.FAULT_MANAGE] },
      { label: "Revízie a údržba", href: "/inspections", icon: Settings, permission: PERMISSIONS.INSPECTION_VIEW },
      { label: "Inventarizácia", href: "/inventories", icon: ClipboardList, permission: PERMISSIONS.INVENTORY_VIEW },
    ],
  },
  {
    label: "Ľudia",
    items: [
      { label: "Kurzy a školenia", href: "/courses", icon: GraduationCap, permission: PERMISSIONS.TRAINING_VIEW },
      { label: "Výstroj", href: "/gear", icon: Shirt, permission: PERMISSIONS.INVENTORY_VIEW },
    ],
  },
  {
    label: "Dokumenty",
    items: [{ label: "Dokumenty", href: "/documents", icon: FileText, permission: PERMISSIONS.DOCUMENTS_VIEW }],
  },
  {
    label: "Financie",
    items: [
      { label: "Financie", href: "/finance", icon: WalletCards, permission: PERMISSIONS.FINANCE_VIEW },
      { label: "Reporty", href: "/reports", icon: BarChart3, permission: PERMISSIONS.REPORTS_VIEW },
    ],
  },
  {
    label: "Komunikácia",
    items: [{ label: "Výbor", href: "/communication", icon: MessageSquare, permission: PERMISSIONS.COMMUNICATION_VIEW }],
  },
  {
    label: "Systém",
    items: [{ label: "Administrácia", href: "/admin", icon: Settings, permission: PERMISSIONS.ADMIN_USERS }],
  },
];

export function filterNavByPermissions(sections: NavGroup[], permissions: string[]): NavGroup[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!item.permission) return true;
        const required = Array.isArray(item.permission) ? item.permission : [item.permission];
        return required.some((permission) => permissions.includes(permission));
      }),
    }))
    .filter((section) => section.items.length > 0);
}
