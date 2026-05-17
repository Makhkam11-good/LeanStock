import type { UserRole } from "../types/api";

export const roleLabels: Record<UserRole, string> = {
  SYSTEM_ADMIN: "Platform admin",
  MANAGER: "Company admin",
  WAREHOUSE_OPERATOR: "Warehouse operator",
  AUDITOR: "Auditor",
};

export const roleDescriptions: Record<UserRole, string> = {
  SYSTEM_ADMIN: "Global tenant operations, company activation, and platform-wide visibility.",
  MANAGER: "Company-scoped product, warehouse, employee, inventory, and report management.",
  WAREHOUSE_OPERATOR: "Day-to-day stock receiving, transfers, sales, and reservations.",
  AUDITOR: "Read-only compliance visibility across company inventory and reports.",
};

export const roleRank: Record<UserRole, number> = {
  SYSTEM_ADMIN: 4,
  MANAGER: 3,
  WAREHOUSE_OPERATOR: 2,
  AUDITOR: 1,
};

export function hasRole(role: UserRole | undefined, allowed: UserRole[]) {
  return Boolean(role && allowed.includes(role));
}

export function canManageUsers(role?: UserRole) {
  return hasRole(role, ["SYSTEM_ADMIN", "MANAGER"]);
}

export function canManageProducts(role?: UserRole) {
  return hasRole(role, ["SYSTEM_ADMIN", "MANAGER"]);
}

export function canManageWarehouses(role?: UserRole) {
  return hasRole(role, ["SYSTEM_ADMIN", "MANAGER"]);
}

export function canOperateStock(role?: UserRole) {
  return hasRole(role, ["SYSTEM_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"]);
}

export function canTriggerDecay(role?: UserRole) {
  return hasRole(role, ["SYSTEM_ADMIN", "MANAGER"]);
}

export function canViewCompanies(role?: UserRole) {
  return role === "SYSTEM_ADMIN";
}
