import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/leanstock";
import { useAuth } from "../auth/AuthProvider";
import { UserCreateForm } from "../components/UserCreateForm";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, Select } from "../components/ui/Fields";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States";

export function UsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(user?.tenant_id ?? null);
  const isPlatform = user?.role === "SYSTEM_ADMIN";

  const tenants = useQuery({
    queryKey: ["admin", "tenants", "users-page"],
    queryFn: () => adminApi.listTenants({ limit: 100 }),
    enabled: isPlatform,
  });

  const tenantDetail = useQuery({
    queryKey: ["admin", "tenant", selectedTenantId],
    queryFn: () => adminApi.getTenant(selectedTenantId!),
    enabled: isPlatform && Boolean(selectedTenantId),
  });

  return (
    <PageShell title="Users" description="User creation is supported by `/auth/register`; full company user listing is only exposed inside SYSTEM_ADMIN tenant detail.">
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <SectionHeader title="Visible users" description={isPlatform ? "Select a tenant to inspect users returned by `/admin/tenants/:id`." : "Backend currently has no manager-scoped list users endpoint."} />

          {isPlatform ? (
            <div className="mb-4 max-w-md">
              <Field label="Tenant">
                <Select value={selectedTenantId ?? ""} onChange={(event) => setSelectedTenantId(event.target.value || null)}>
                  <option value="">Select tenant</option>
                  {tenants.data?.data.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          {isPlatform && tenantDetail.isLoading ? <LoadingState /> : null}
          {isPlatform && tenantDetail.error ? <ErrorState error={tenantDetail.error} /> : null}
          {isPlatform && tenantDetail.data ? (
            <DataTable
              data={tenantDetail.data.users}
              getKey={(item) => item.id}
              emptyTitle="No users returned"
              emptyDescription="Tenant detail returns up to 20 users, and this tenant returned none."
              columns={[
                { header: "Name", cell: (item) => `${item.first_name} ${item.last_name}` },
                { header: "Email", cell: (item) => item.email },
                { header: "Role", cell: (item) => <Badge tone="blue">{item.role}</Badge> },
                { header: "Active", cell: (item) => <Badge tone={item.is_active ? "green" : "amber"}>{item.is_active ? "Active" : "Inactive"}</Badge> },
                { header: "Verified", cell: (item) => <Badge tone={item.is_email_verified ? "green" : "amber"}>{item.is_email_verified ? "Verified" : "Pending"}</Badge> },
              ]}
            />
          ) : null}

          {!isPlatform ? (
            <EmptyState
              title="User list endpoint is not exposed"
              description="Company managers can create staff, but the backend does not currently expose `GET /users` or a manager-scoped user directory."
            />
          ) : null}
        </Card>

        <Card>
          <SectionHeader title="Create staff" description={isPlatform ? "SYSTEM_ADMIN must choose a tenant before creating company staff." : "Managers create staff inside their own active tenant."} />
          <UserCreateForm
            tenantId={isPlatform ? selectedTenantId : undefined}
            onCreated={() => {
              if (selectedTenantId) void queryClient.invalidateQueries({ queryKey: ["admin", "tenant", selectedTenantId] });
            }}
          />
        </Card>
      </div>
    </PageShell>
  );
}
