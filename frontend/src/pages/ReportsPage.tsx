import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Play, Search } from "lucide-react";
import { jobApi, locationApi, productApi, reportApi } from "../api/leanstock";
import { useAuth } from "../auth/AuthProvider";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, Input, Select } from "../components/ui/Fields";
import { ErrorState } from "../components/ui/States";
import { formatDate, formatDateTime } from "../lib/format";
import { canTriggerDecay } from "../lib/roles";

export function ReportsPage() {
  const { user } = useAuth();
  const canTrigger = canTriggerDecay(user?.role);
  const [thresholdDays, setThresholdDays] = useState(30);
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [jobId, setJobId] = useState("");

  const products = useQuery({ queryKey: ["products", "report-options"], queryFn: () => productApi.list({ limit: 100 }) });
  const locations = useQuery({ queryKey: ["locations", "report-options"], queryFn: () => locationApi.list({ limit: 100 }) });
  const lowStock = useQuery({ queryKey: ["reports", "low-stock"], queryFn: () => reportApi.lowStock() });
  const deadStock = useQuery({
    queryKey: ["reports", "dead-stock", thresholdDays],
    queryFn: () => reportApi.deadStock(thresholdDays),
  });
  const decayHistory = useQuery({
    queryKey: ["reports", "decay-history", productId, locationId],
    queryFn: () => reportApi.decayHistory({ product_id: productId || undefined, location_id: locationId || undefined }),
  });
  const jobStatus = useQuery({
    queryKey: ["jobs", jobId],
    queryFn: () => jobApi.get(jobId),
    enabled: Boolean(jobId),
  });

  const trigger = useMutation({
    mutationFn: (sync: boolean) => reportApi.triggerDecay({ sync, threshold_days: thresholdDays }),
    onSuccess: (result) => {
      if (result.job?.id) setJobId(result.job.id);
      void deadStock.refetch();
      void decayHistory.refetch();
    },
  });

  return (
    <PageShell title="Reports and analytics" description="Analytics are powered by backend report endpoints for low stock, dead stock, decay history, and optional job status.">
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <SectionHeader title="Low stock" description="Items whose quantity on hand is at or below reorder point." />
            <DataTable
              data={lowStock.data?.low_stock_items}
              isLoading={lowStock.isLoading}
              error={lowStock.error}
              getKey={(item) => item.id}
              emptyTitle="No low stock"
              emptyDescription="Visible inventory rows are above reorder point."
              columns={[
                { header: "SKU", cell: (item) => item.product?.sku ?? item.product_id },
                { header: "Product", cell: (item) => item.product?.name ?? "-" },
                { header: "Location", cell: (item) => item.location?.name ?? item.location_id },
                { header: "On hand", cell: (item) => item.quantity_on_hand },
                { header: "Reorder", cell: (item) => item.reorder_point },
              ]}
            />
          </Card>

          <Card>
            <SectionHeader title="Dead stock" description="Lot candidates older than the configured threshold and eligible for decay." />
            <div className="mb-4 max-w-xs">
              <Field label="Threshold days">
                <Input type="number" min="1" value={thresholdDays} onChange={(event) => setThresholdDays(Number(event.target.value))} />
              </Field>
            </div>
            <DataTable
              data={deadStock.data?.dead_stock_lots}
              isLoading={deadStock.isLoading}
              error={deadStock.error}
              getKey={(item) => item.inventory_lot_id}
              emptyTitle="No dead stock"
              emptyDescription="No lots currently qualify for decay with this threshold."
              columns={[
                { header: "Lot", cell: (item) => <span className="font-semibold text-slate-950">{item.lot_code}</span> },
                { header: "SKU", cell: (item) => item.sku },
                { header: "Product", cell: (item) => item.name },
                { header: "Qty", cell: (item) => item.quantity_on_hand },
                { header: "Days", cell: (item) => item.days_in_stock },
                { header: "Discount", cell: (item) => `${item.catalog_discount}%` },
                { header: "Received", cell: (item) => formatDate(item.received_at) },
              ]}
            />
          </Card>

          <Card>
            <SectionHeader title="Decay history" description="Audit trail from `/reports/decay-history`." />
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <Field label="Product">
                <Select value={productId} onChange={(event) => setProductId(event.target.value)}>
                  <option value="">All products</option>
                  {products.data?.data.map((product) => (
                    <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Location">
                <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  <option value="">All locations</option>
                  {locations.data?.data.map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <DataTable
              data={decayHistory.data}
              isLoading={decayHistory.isLoading}
              error={decayHistory.error}
              getKey={(item) => item.id}
              emptyTitle="No decay records"
              emptyDescription="No dead stock decay audits matched these filters."
              columns={[
                { header: "Product", cell: (item) => item.product ? `${item.product.sku} - ${item.product.name}` : item.product_id },
                { header: "Lot", cell: (item) => item.inventory_lot?.lot_code ?? item.inventory_lot_id },
                { header: "Old", cell: (item) => `${item.old_discount_pct}%` },
                { header: "New", cell: (item) => `${item.new_discount_pct}%` },
                { header: "Days", cell: (item) => item.days_in_inventory },
                { header: "Applied", cell: (item) => formatDateTime(item.created_at) },
              ]}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <SectionHeader title="Manual decay" description="MANAGER and SYSTEM_ADMIN can enqueue or synchronously run decay." />
            {trigger.error ? <ErrorState error={trigger.error} /> : null}
            {trigger.data ? (
              <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                {trigger.data.message}
                {trigger.data.job?.id ? <span className="mt-1 block">Job: {trigger.data.job.id}</span> : null}
                {trigger.data.processed !== undefined ? <span className="mt-1 block">Processed: {trigger.data.processed}</span> : null}
              </div>
            ) : null}
            <div className="space-y-3">
              <Button disabled={!canTrigger || trigger.isPending} onClick={() => trigger.mutate(false)}>
                <Play className="h-4 w-4" />
                Queue job
              </Button>
              <Button variant="secondary" disabled={!canTrigger || trigger.isPending} onClick={() => trigger.mutate(true)}>
                Run sync
              </Button>
              {!canTrigger ? <Badge tone="amber">Read-only role</Badge> : null}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Job status" description="Inspect Redis-backed job state through `/jobs/:id`." />
            <div className="space-y-3">
              <Field label="Job ID">
                <Input value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="dead-stock.decay:42" />
              </Field>
              <Button variant="secondary" onClick={() => void jobStatus.refetch()} disabled={!jobId}>
                <Search className="h-4 w-4" /> Refresh
              </Button>
              {jobStatus.error ? <ErrorState error={jobStatus.error} /> : null}
              {jobStatus.data ? (
                <div className="rounded-lg border border-slate-200 p-4 text-sm">
                  <p className="font-semibold text-slate-950">{jobStatus.data.id}</p>
                  <p className="mt-1 text-slate-600">Status: <Badge tone={jobStatus.data.status === "completed" ? "green" : jobStatus.data.status === "failed" ? "red" : "blue"}>{jobStatus.data.status}</Badge></p>
                  <p className="mt-2 text-slate-600">Attempts: {jobStatus.data.attempts ?? 0} / {jobStatus.data.max_attempts ?? "-"}</p>
                  {jobStatus.data.last_error ? <p className="mt-2 text-rose-700">{jobStatus.data.last_error}</p> : null}
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
