import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Power, PowerOff } from "lucide-react";
import { adminApi } from "../api/leanstock";
import { UserCreateForm } from "../components/UserCreateForm";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, Input, Select } from "../components/ui/Fields";
import { ErrorState, LoadingState } from "../components/ui/States";
import { formatDate } from "../lib/format";

export function CompaniesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "true" | "false">("");
  const [after, setAfter] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const tenants = useQuery({
    queryKey: ["admin", "tenants", { search, status, after }],
    queryFn: () => adminApi.listTenants({ limit: 20, search, is_active: status || undefined, after }),
  });

  const tenantDetail = useQuery({
    queryKey: ["admin", "tenant", selectedTenantId],
    queryFn: () => adminApi.getTenant(selectedTenantId!),
    enabled: Boolean(selectedTenantId),
  });

  const activation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? adminApi.activateTenant(id) : adminApi.deactivateTenant(id),
    onSuccess: (tenant) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "tenant", tenant.id] });
    },
  });

  const selectedTenant = tenantDetail.data;
  const filters = useMemo(
    () => (
      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <Field label="Search">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or slug" />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value as "" | "true" | "false")}>
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button variant="secondary" onClick={() => setAfter(null)}>
            Reset page
          </Button>
        </div>
      </div>
    ),
    [search, status],
  );

  return (
    <PageShell title="Companies" description="Platform admin tenant management backed by `/api/v1/admin/tenants`.">
      <Card>
        <SectionHeader title="Tenant directory" description="Filter companies, inspect tenant users, and activate or deactivate company access." />
        {filters}
        {activation.error ? <div className="mt-4"><ErrorState error={activation.error} /></div> : null}
        <div className="mt-4">
          <DataTable
            data={tenants.data?.data}
            isLoading={tenants.isLoading}
            error={tenants.error}
            getKey={(tenant) => tenant.id}
            emptyTitle="No companies"
            emptyDescription="No tenants matched the current filters."
            pagination={tenants.data?.pagination}
            onLoadMore={() => setAfter(tenants.data?.pagination.next_cursor ?? null)}
            isFetchingMore={tenants.isFetching}
            columns={[
              { header: "Company", cell: (tenant) => <span className="font-semibold text-slate-950">{tenant.name}</span> },
              { header: "Slug", cell: (tenant) => tenant.slug },
              { header: "Status", cell: (tenant) => <Badge tone={tenant.is_active ? "green" : "amber"}>{tenant.is_active ? "Active" : "Inactive"}</Badge> },
              { header: "Users", cell: (tenant) => tenant._count?.users ?? 0 },
              { header: "Warehouses", cell: (tenant) => tenant._count?.warehouses ?? 0 },
              { header: "Products", cell: (tenant) => tenant._count?.products ?? 0 },
              { header: "Created", cell: (tenant) => formatDate(tenant.created_at) },
              {
                header: "Actions",
                cell: (tenant) => (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" className="px-3" title="View tenant" onClick={() => setSelectedTenantId(tenant.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={tenant.is_active ? "danger" : "primary"}
                      className="px-3"
                      title={tenant.is_active ? "Deactivate" : "Activate"}
                      disabled={activation.isPending}
                      onClick={() => activation.mutate({ id: tenant.id, active: !tenant.is_active })}
                    >
                      {tenant.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </Card>

      {selectedTenantId ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <Card>
            <SectionHeader title="Tenant detail" description="Backend exposes the first 20 users on tenant detail." />
            {tenantDetail.isLoading ? <LoadingState /> : null}
            {tenantDetail.error ? <ErrorState error={tenantDetail.error} /> : null}
            {selectedTenant ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-sm text-slate-500">Name</p>
                    <p className="font-semibold text-slate-950">{selectedTenant.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Slug</p>
                    <p className="font-semibold text-slate-950">{selectedTenant.slug}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Status</p>
                    <Badge tone={selectedTenant.is_active ? "green" : "amber"}>{selectedTenant.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Created</p>
                    <p className="font-semibold text-slate-950">{formatDate(selectedTenant.created_at)}</p>
                  </div>
                </div>

                <DataTable
                  data={selectedTenant.users}
                  getKey={(user) => user.id}
                  emptyTitle="No users returned"
                  emptyDescription="The tenant detail endpoint did not return users for this company."
                  columns={[
                    { header: "Name", cell: (user) => `${user.first_name} ${user.last_name}` },
                    { header: "Email", cell: (user) => user.email },
                    { header: "Role", cell: (user) => <Badge tone="blue">{user.role}</Badge> },
                    { header: "Active", cell: (user) => <Badge tone={user.is_active ? "green" : "amber"}>{user.is_active ? "Yes" : "No"}</Badge> },
                  ]}
                />
              </div>
            ) : null}
          </Card>

          <Card>
            <SectionHeader title="Create tenant user" description="Uses `/auth/register` with selected `tenant_id`." />
            <UserCreateForm tenantId={selectedTenantId} onCreated={() => void queryClient.invalidateQueries({ queryKey: ["admin", "tenant", selectedTenantId] })} />
          </Card>
        </div>
      ) : null}
    </PageShell>
  );
}
