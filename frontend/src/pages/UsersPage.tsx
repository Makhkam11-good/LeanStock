import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, userApi } from "../api/leanstock";
import { useAuth } from "../auth/AuthProvider";
import { UserCreateForm } from "../components/UserCreateForm";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, Input, Select } from "../components/ui/Fields";
import { roleLabels } from "../lib/roles";
import type { UserRole } from "../types/api";

export function UsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(user?.tenant_id ?? null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<"" | "true" | "false">("");
  const [after, setAfter] = useState<string | null>(null);
  const isPlatform = user?.role === "SYSTEM_ADMIN";

  const tenants = useQuery({
    queryKey: ["admin", "tenants", "users-page"],
    queryFn: () => adminApi.listTenants({ limit: 100 }),
    enabled: isPlatform,
  });

  const users = useQuery({
    queryKey: ["users", { selectedTenantId, search, role, status, after }],
    queryFn: () => userApi.list({
      limit: 20,
      after,
      search,
      tenant_id: isPlatform ? selectedTenantId ?? undefined : undefined,
      role: role ? role as UserRole : undefined,
      is_active: status || undefined,
    }),
  });

  return (
    <PageShell title="Users" description="Staff creation uses `/auth/register`; the table uses `/users` with backend tenant scoping.">
      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <SectionHeader title="Visible users" description={isPlatform ? "Platform admins can see all users or filter by tenant." : "Company admins see users only inside their own tenant."} />

          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_160px_auto]">
            {isPlatform ? (
              <Field label="Tenant">
                <Select value={selectedTenantId ?? ""} onChange={(event) => setSelectedTenantId(event.target.value || null)}>
                  <option value="">All tenants</option>
                  {tenants.data?.data.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Search">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email or name" />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="">All roles</option>
                <option value="COMPANY_ADMIN">Company admin</option>
                <option value="MANAGER">Manager</option>
                <option value="WAREHOUSE_OPERATOR">Warehouse operator</option>
                <option value="AUDITOR">Auditor</option>
                {isPlatform ? <option value="SYSTEM_ADMIN">Platform admin</option> : null}
              </Select>
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

          <DataTable
            data={users.data?.data}
            isLoading={users.isLoading}
            error={users.error}
            getKey={(item) => item.id}
            pagination={users.data?.pagination}
            onLoadMore={() => setAfter(users.data?.pagination.next_cursor ?? null)}
            isFetchingMore={users.isFetching}
            emptyTitle="No users found"
            emptyDescription="No staff matched the current filters."
            columns={[
              { header: "Name", cell: (item) => `${item.first_name} ${item.last_name}` },
              { header: "Email", cell: (item) => item.email },
              { header: "Tenant", cell: (item) => item.tenant?.name ?? "Platform" },
              { header: "Role", cell: (item) => <Badge tone="blue">{roleLabels[item.role]}</Badge> },
              { header: "Active", cell: (item) => <Badge tone={item.is_active ? "green" : "amber"}>{item.is_active ? "Active" : "Inactive"}</Badge> },
              { header: "Verified", cell: (item) => <Badge tone={item.is_email_verified ? "green" : "amber"}>{item.is_email_verified ? "Verified" : "Pending"}</Badge> },
            ]}
          />
        </Card>

        <Card>
          <SectionHeader title="Create staff" description={isPlatform ? "SYSTEM_ADMIN must choose a tenant before creating company staff." : "Company admins create staff inside their own active tenant."} />
          <UserCreateForm
            tenantId={isPlatform ? selectedTenantId : undefined}
            onCreated={() => {
              void queryClient.invalidateQueries({ queryKey: ["users"] });
              void queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
            }}
          />
        </Card>
      </div>
    </PageShell>
  );
}
