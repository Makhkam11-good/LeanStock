import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, Package, ShieldCheck, Warehouse } from "lucide-react";
import { adminApi, inventoryApi, productApi, reportApi, warehouseApi } from "../api/leanstock";
import { useAuth } from "../auth/AuthProvider";
import { Badge } from "../components/ui/Badge";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { ErrorState } from "../components/ui/States";
import { PageShell } from "../components/PageShell";
import { formatMoney } from "../lib/format";
import { canViewCompanies, roleDescriptions, roleLabels } from "../lib/roles";

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "teal" | "amber" | "blue" | "rose";
}) {
  const tones = {
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-sky-50 text-sky-700",
    rose: "bg-rose-50 text-rose-700",
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-normal text-slate-950">{value}</p>
        </div>
        <span className={`rounded-md p-3 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const isPlatform = canViewCompanies(user?.role);

  const products = useQuery({ queryKey: ["products", "dashboard"], queryFn: () => productApi.list({ limit: 5 }) });
  const warehouses = useQuery({ queryKey: ["warehouses", "dashboard"], queryFn: () => warehouseApi.list({ limit: 5 }) });
  const inventory = useQuery({ queryKey: ["inventory", "dashboard"], queryFn: () => inventoryApi.list({ limit: 5 }) });
  const lowStock = useQuery({ queryKey: ["reports", "low-stock"], queryFn: () => reportApi.lowStock() });
  const tenants = useQuery({
    queryKey: ["admin", "tenants", "dashboard"],
    queryFn: () => adminApi.listTenants({ limit: 5 }),
    enabled: isPlatform,
  });

  const firstError = products.error ?? warehouses.error ?? inventory.error ?? lowStock.error ?? tenants.error;

  return (
    <PageShell
      title="Dashboard"
      description={user ? `${roleLabels[user.role]} view. ${roleDescriptions[user.role]}` : undefined}
    >
      {firstError ? <ErrorState error={firstError} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={isPlatform ? "Companies on page" : "Products on page"} value={isPlatform ? tenants.data?.pagination.count ?? "-" : products.data?.pagination.count ?? "-"} icon={isPlatform ? Building2 : Package} />
        <StatCard label="Warehouses on page" value={warehouses.data?.pagination.count ?? "-"} icon={Warehouse} tone="blue" />
        <StatCard label="Inventory rows" value={inventory.data?.pagination.count ?? "-"} icon={ShieldCheck} tone="teal" />
        <StatCard label="Low stock alerts" value={lowStock.data?.count ?? "-"} icon={AlertTriangle} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {isPlatform ? (
          <Card>
            <SectionHeader title="Companies" description="SYSTEM_ADMIN-only tenant overview." />
            <DataTable
              data={tenants.data?.data}
              isLoading={tenants.isLoading}
              error={tenants.error}
              getKey={(tenant) => tenant.id}
              emptyTitle="No companies found"
              emptyDescription="No tenant rows matched the current page."
              columns={[
                { header: "Company", cell: (tenant) => <span className="font-semibold text-slate-950">{tenant.name}</span> },
                { header: "Slug", cell: (tenant) => tenant.slug },
                { header: "Status", cell: (tenant) => <Badge tone={tenant.is_active ? "green" : "amber"}>{tenant.is_active ? "Active" : "Inactive"}</Badge> },
                { header: "Users", cell: (tenant) => tenant._count?.users ?? 0 },
              ]}
            />
          </Card>
        ) : null}

        <Card>
          <SectionHeader title="Inventory snapshot" description="Current stock rows from `/inventory`." />
          <DataTable
            data={inventory.data?.data}
            isLoading={inventory.isLoading}
            error={inventory.error}
            getKey={(item) => item.id}
            emptyTitle="No inventory yet"
            emptyDescription="Receive stock to create inventory rows."
            columns={[
              { header: "SKU", cell: (item) => item.product?.sku ?? item.product_id },
              { header: "Product", cell: (item) => item.product?.name ?? "-" },
              { header: "Location", cell: (item) => item.location?.name ?? item.location_id },
              { header: "On hand", cell: (item) => item.quantity_on_hand },
              { header: "Reserved", cell: (item) => item.quantity_reserved },
            ]}
          />
        </Card>

        <Card>
          <SectionHeader title="Products" description="Catalog rows from `/products`." />
          <DataTable
            data={products.data?.data}
            isLoading={products.isLoading}
            error={products.error}
            getKey={(product) => product.id}
            emptyTitle="No products"
            emptyDescription="Company admins can create the first product."
            columns={[
              { header: "SKU", cell: (product) => <span className="font-semibold text-slate-950">{product.sku}</span> },
              { header: "Name", cell: (product) => product.name },
              { header: "Category", cell: (product) => product.category },
              { header: "Price", cell: (product) => formatMoney(product.base_price) },
            ]}
          />
        </Card>

        <Card>
          <SectionHeader title="Low stock" description="Report data from `/reports/low-stock`." />
          <DataTable
            data={lowStock.data?.low_stock_items}
            isLoading={lowStock.isLoading}
            error={lowStock.error}
            getKey={(item) => item.id}
            emptyTitle="No low stock alerts"
            emptyDescription="All visible inventory is above reorder point."
            columns={[
              { header: "Product", cell: (item) => item.product?.name ?? item.product_id },
              { header: "Location", cell: (item) => item.location?.name ?? item.location_id },
              { header: "On hand", cell: (item) => item.quantity_on_hand },
              { header: "Reorder", cell: (item) => item.reorder_point },
            ]}
          />
        </Card>
      </div>
    </PageShell>
  );
}
