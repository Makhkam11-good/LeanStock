import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  Truck,
  UserCircle,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import { canManageUsers, canViewCompanies, roleLabels } from "../../lib/roles";
import { initials } from "../../lib/format";
import type { UserRole } from "../../types/api";
import { Button } from "../ui/Button";

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Companies", path: "/companies", icon: Building2, roles: ["SYSTEM_ADMIN"] },
  { label: "Users", path: "/users", icon: Users, roles: ["SYSTEM_ADMIN", "MANAGER"] },
  { label: "Roles", path: "/roles", icon: ShieldCheck },
  { label: "Warehouses", path: "/warehouses", icon: Warehouse },
  { label: "Products", path: "/products", icon: Package },
  { label: "Inventory", path: "/inventory", icon: Boxes },
  { label: "Movements", path: "/movements", icon: Truck, roles: ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"] },
  { label: "Orders", path: "/orders", icon: ClipboardList },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings },
  { label: "Profile", path: "/profile", icon: UserCircle },
];

function canSeeItem(role: UserRole, item: NavItem) {
  if (item.path === "/companies") return canViewCompanies(role);
  if (item.path === "/users") return canManageUsers(role);
  return !item.roles || item.roles.includes(role);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  if (!user) return null;

  const visibleItems = navItems.filter((item) => canSeeItem(user.role, item));

  return (
    <div className="flex h-full flex-col">
      <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-3 px-4 py-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-600 text-white">
          <Home className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-base font-bold text-slate-950">LeanStock</span>
          <span className="block text-xs font-medium text-slate-500">Inventory control</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "bg-teal-50 text-teal-800 ring-1 ring-teal-100"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">
            {initials(user.first_name, user.last_name, user.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">
              {user.first_name} {user.last_name}
            </p>
            <p className="truncate text-xs text-slate-500">{roleLabels[user.role]}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-950/35"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-80 max-w-[85vw] bg-white shadow-xl">
            <button
              className="absolute right-3 top-3 rounded-md p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <button
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-950">
                {user?.tenant?.name ?? "LeanStock Platform"}
              </p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="px-3" title="Logout">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
