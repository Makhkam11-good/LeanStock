import { API_BASE_URL } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { EmptyState } from "../components/ui/States";
import { roleLabels } from "../lib/roles";

const capabilities = [
  { area: "API base URL", status: "Configured", detail: API_BASE_URL },
  { area: "CORS", status: "Backend ready", detail: "Development allows http://localhost:5173 in src/app.js." },
  { area: "Tariffs and limits", status: "Not exposed", detail: "No plan, billing, or limits model/route found." },
  { area: "System settings", status: "Not exposed", detail: "No mutable settings endpoint found." },
  { area: "Warehouse access assignments", status: "Model only", detail: "UserWarehouse exists, but no route exposes assignment CRUD." },
];

export function SettingsPage() {
  const { user } = useAuth();

  return (
    <PageShell title="Settings" description="Operational settings surfaced from backend capabilities without inventing unsupported APIs.">
      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <SectionHeader title="Integration status" description="These are the frontend/backend integration assumptions in use." />
          <DataTable
            data={capabilities}
            getKey={(item) => item.area}
            emptyTitle="No settings"
            emptyDescription="No settings capabilities were detected."
            columns={[
              { header: "Area", cell: (item) => <span className="font-semibold text-slate-950">{item.area}</span> },
              { header: "Status", cell: (item) => <Badge tone={item.status === "Configured" || item.status === "Backend ready" ? "green" : item.status === "Model only" ? "amber" : "neutral"}>{item.status}</Badge> },
              { header: "Detail", cell: (item) => item.detail },
            ]}
          />
        </Card>

        <Card>
          <SectionHeader title="Current tenant" description="From `/auth/me`." />
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-slate-500">User role</p>
              <p className="font-semibold text-slate-950">{user ? roleLabels[user.role] : "-"}</p>
            </div>
            <div>
              <p className="text-slate-500">Tenant</p>
              <p className="font-semibold text-slate-950">{user?.tenant?.name ?? "Platform scope"}</p>
            </div>
            <div>
              <p className="text-slate-500">Tenant status</p>
              {user?.tenant ? (
                <Badge tone={user.tenant.is_active ? "green" : "amber"}>{user.tenant.is_active ? "Active" : "Inactive"}</Badge>
              ) : (
                <Badge tone="violet">SYSTEM_ADMIN</Badge>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeader title="Unsupported platform controls" description="Shown clearly so operators do not mistake missing endpoints for broken UI." />
        <EmptyState
          title="No settings mutation endpoints"
          description="Tariffs, limits, feature flags, global settings, and warehouse assignment CRUD are not currently exposed by the backend API."
        />
      </Card>
    </PageShell>
  );
}
