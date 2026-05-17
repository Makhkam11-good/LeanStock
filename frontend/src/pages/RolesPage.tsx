import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { roleDescriptions, roleLabels } from "../lib/roles";
import type { UserRole } from "../types/api";

const rows: Array<{
  role: UserRole;
  scope: string;
  read: string;
  write: string;
  special: string;
}> = [
  {
    role: "SYSTEM_ADMIN",
    scope: "Platform",
    read: "All visible tenants and scoped inventory data",
    write: "Tenant activation, staff creation, product/warehouse/inventory writes where tenant context is available",
    special: "Only role allowed on `/admin/tenants`",
  },
  {
    role: "MANAGER",
    scope: "Own company",
    read: "Products, warehouses, locations, inventory, reports",
    write: "Products, warehouses, locations, users, stock operations, decay trigger",
    special: "Tenant-scoped by backend middleware and services",
  },
  {
    role: "WAREHOUSE_OPERATOR",
    scope: "Own company",
    read: "Products, warehouses, locations, inventory, reports",
    write: "Receive, transfer, sell, reserve, release reservations",
    special: "Cannot create catalog or warehouse records",
  },
  {
    role: "AUDITOR",
    scope: "Own company",
    read: "Products, warehouses, locations, inventory, reports",
    write: "None",
    special: "Read-only compliance flow",
  },
];

export function RolesPage() {
  return (
    <PageShell title="Roles and permissions" description="This is the backend RBAC matrix from `src/middleware/rbac.middleware.js`; there is no role CRUD endpoint.">
      <Card>
        <SectionHeader title="Permission matrix" description="Frontend route gates mirror backend role checks, but backend remains the source of truth." />
        <DataTable
          data={rows}
          getKey={(row) => row.role}
          emptyTitle="No roles"
          emptyDescription="RBAC enum is empty."
          columns={[
            { header: "Role", cell: (row) => <Badge tone={row.role === "SYSTEM_ADMIN" ? "violet" : row.role === "MANAGER" ? "blue" : row.role === "WAREHOUSE_OPERATOR" ? "green" : "neutral"}>{roleLabels[row.role]}</Badge> },
            { header: "Scope", cell: (row) => row.scope },
            { header: "Read", cell: (row) => row.read },
            { header: "Write", cell: (row) => row.write },
            { header: "Special", cell: (row) => row.special },
          ]}
        />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.role}>
            <h2 className="text-lg font-semibold text-slate-950">{roleLabels[row.role]}</h2>
            <p className="mt-2 text-sm text-slate-600">{roleDescriptions[row.role]}</p>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
