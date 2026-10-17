import {
  CalendarDays,
  Car,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Section } from "@/lib/rbac";

export type NavItem = {
  section: Section;
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { section: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "fleet", href: "/fleet", label: "Flotte", icon: Car },
  { section: "customers", href: "/customers", label: "Clients", icon: Users },
  { section: "bookings", href: "/bookings", label: "Réservations", icon: CalendarDays },
  { section: "contracts", href: "/contracts", label: "Contrats", icon: FileText },
  { section: "invoices", href: "/invoices", label: "Factures", icon: Receipt },
  { section: "maintenance", href: "/maintenance", label: "Maintenance", icon: Wrench },
  { section: "assistant", href: "/assistant", label: "Assistant IA", icon: Sparkles },
  { section: "settings", href: "/settings/agencies", label: "Paramètres", icon: Settings },
];

export const SECTION_ICONS: Record<Section, LucideIcon> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.section, item.icon]),
) as Record<Section, LucideIcon>;
