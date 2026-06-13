// Starter categories. `category` on an item is just a string, so users aren't
// limited to these — they're suggestions that drive nice icons/colors.
import {
  Home,
  Bike,
  Car,
  Laptop,
  Network,
  Mountain,
  Ship,
  Plane,
  Wrench,
  Package,
  type LucideIcon,
} from "lucide-react";

export interface CategoryDef {
  key: string;
  label: string;
  icon: LucideIcon;
}

export const CATEGORIES: CategoryDef[] = [
  { key: "house", label: "House / Property", icon: Home },
  { key: "bike", label: "Bike", icon: Bike },
  { key: "vehicle", label: "Car / MC", icon: Car },
  { key: "computer", label: "Computer / Electronics", icon: Laptop },
  { key: "network", label: "Network", icon: Network },
  { key: "cabin", label: "Cabin", icon: Mountain },
  { key: "boat", label: "Boat", icon: Ship },
  { key: "travel", label: "Travel plan", icon: Plane },
  { key: "tools", label: "Tools / Equipment", icon: Wrench },
  { key: "general", label: "General", icon: Package },
];

export function categoryDef(key: string | null | undefined): CategoryDef {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}
