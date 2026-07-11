import {
  Activity,
  Banknote,
  Bell,
  Boxes,
  ChartColumn,
  Clock3,
  CreditCard,
  FileText,
  LayoutDashboard,
  Mail,
  Package,
  Shield,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";

export type NavGroupKey = "access" | "people" | "finance" | "operations" | "system";

export type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
};

export type NavGroup = {
  key: NavGroupKey | null;
  items: readonly NavItem[];
};

export const navigationGroups: readonly NavGroup[] = [
  { key: null, items: [{ label: "Dashboard", icon: LayoutDashboard }] },
  {
    key: "access",
    items: [
      { label: "Authentication", icon: Shield },
      { label: "Users", icon: Users },
    ],
  },
  {
    key: "people",
    items: [
      { label: "HR", icon: Workflow },
      { label: "Attendance", icon: Clock3 },
      { label: "Payroll", icon: Wallet },
    ],
  },
  {
    key: "finance",
    items: [
      { label: "Accounting", icon: Banknote },
      { label: "Expenses", icon: CreditCard },
    ],
  },
  {
    key: "operations",
    items: [
      { label: "Inventory", icon: Boxes },
      { label: "Manufacturing", icon: Package },
    ],
  },
  {
    key: "system",
    items: [
      { label: "Notifications", icon: Bell },
      { label: "Email", icon: Mail },
      { label: "Reports", icon: ChartColumn },
      { label: "Audit", icon: Activity },
      { label: "Documents", icon: FileText },
    ],
  },
] as const;
