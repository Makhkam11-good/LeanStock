import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Lock, Unlock, X } from "lucide-react";
import { inventoryApi, locationApi, productApi } from "../api/leanstock";
import { useAuth } from "../auth/AuthProvider";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, Input, Select } from "../components/ui/Fields";
import { ErrorState, LoadingState } from "../components/ui/States";
import { formatDate, formatMoney } from "../lib/format";
import { canOperateStock } from "../lib/roles";
import type { Inventory } from "../types/api";

function available(item: Inventory) {
  return item.quantity_on_hand - item.quantity_reserved;
}

export function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canOperate = canOperateStock(user?.role);
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [lowStock, setLowStock] = useState<"" | "true">("");
  const [after, setAfter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const products = useQuery({ queryKey: ["products", "inventory-options"], queryFn: () => productApi.list({ limit: 100 }) });
  const locations = useQuery({ queryKey: ["locations", "inventory-options"], queryFn: () => locationApi.list({ limit: 100 }) });
  const inventory = useQuery({
    queryKey: ["inventory", { productId, locationId, lowStock, after }],
    queryFn: () => inventoryApi.list({
      limit: 20,
      product_id: productId || undefined,
      location_id: locationId || undefined,
      low_stock: lowStock || undefined,
      after,
    }),
  });
  const selected = useQuery({
    queryKey: ["inventory", "detail", selectedId],
    queryFn: () => inventoryApi.get(selectedId!),
    enabled: Boolean(selectedId),
  });

  const reserve = useMutation({
    mutationFn: () => inventoryApi.reserve(selectedId!, quantity),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory", "detail", selectedId] });
    },
  });

  const release = useMutation({
    mutationFn: () => inventoryApi.releaseReservation(selectedId!, quantity),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory", "detail", selectedId] });
    },
  });

  return (
    <PageShell title="Stock inventory" description="Inventory list, filters, lot detail, reservation and release flows from `/inventory`.">
      <div className="min-w-0">
        <Card>
          <SectionHeader title="Inventory rows" description="The API returns product and location summaries for each stock row." />
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_auto]">
            <Field label="Product">
              <Select value={productId} onChange={(event) => setProductId(event.target.value)}>
                <option value="">All products</option>
                {products.data?.data.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} - {product.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Location">
              <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">All locations</option>
                {locations.data?.data.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Stock filter">
              <Select value={lowStock} onChange={(event) => setLowStock(event.target.value as "" | "true")}>
                <option value="">All</option>
                <option value="true">Low stock</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button variant="secondary" onClick={() => setAfter(null)}>
                Reset page
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <DataTable
              data={inventory.data?.data}
              isLoading={inventory.isLoading}
              error={inventory.error}
              getKey={(item) => item.id}
              pagination={inventory.data?.pagination}
              onLoadMore={() => setAfter(inventory.data?.pagination.next_cursor ?? null)}
              isFetchingMore={inventory.isFetching}
              emptyTitle="No inventory"
              emptyDescription="Inventory rows are created when stock is received."
              columns={[
                { header: "SKU", cell: (item) => item.product?.sku ?? item.product_id },
                { header: "Product", cell: (item) => item.product?.name ?? "-" },
                { header: "Location", cell: (item) => item.location?.name ?? item.location_id },
                { header: "Warehouse", className: "hidden lg:table-cell", cell: (item) => item.location?.warehouse?.name ?? "-" },
                { header: "On hand", cell: (item) => item.quantity_on_hand },
                { header: "Reserved", className: "hidden sm:table-cell", cell: (item) => item.quantity_reserved },
                { header: "Available", cell: (item) => <span className={available(item) <= item.reorder_point ? "font-semibold text-amber-700" : "font-semibold text-slate-950"}>{available(item)}</span> },
                { header: "Reorder", className: "hidden md:table-cell", cell: (item) => item.reorder_point },
                {
                  header: "Detail",
                  width: "5rem",
                  cell: (item) => (
                    <Button variant="secondary" className="h-10 w-10 shrink-0 !p-0" title="View lots" onClick={() => setSelectedId(item.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  ),
                },
              ]}
            />
          </div>
        </Card>
      </div>

      {selectedId ? (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-slate-950/35"
            aria-label="Close inventory detail"
            onClick={() => setSelectedId(null)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-950">Inventory detail</h2>
                <p className="mt-1 text-sm text-slate-500">Lot-level data from `/inventory/:id`.</p>
              </div>
              <button
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close inventory detail"
                onClick={() => setSelectedId(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {selected.isLoading ? (
                <LoadingState />
              ) : selected.error ? (
                <ErrorState error={selected.error} />
              ) : selected.data ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Product</p>
                      <p className="font-semibold text-slate-950">{selected.data.product?.name ?? selected.data.product_id}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Location</p>
                      <p className="font-semibold text-slate-950">{selected.data.location?.name ?? selected.data.location_id}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Available</p>
                      <p className="font-semibold text-slate-950">{available(selected.data)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Reserved</p>
                      <p className="font-semibold text-slate-950">{selected.data.quantity_reserved}</p>
                    </div>
                  </div>

                  {canOperate ? (
                    <div className="rounded-lg border border-slate-200 p-4">
                      <Field label="Quantity">
                        <Input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
                      </Field>
                      {(reserve.error || release.error) ? <div className="mt-3"><ErrorState error={reserve.error ?? release.error} /></div> : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button disabled={reserve.isPending || !quantity} onClick={() => reserve.mutate()}>
                          <Lock className="h-4 w-4" /> Reserve
                        </Button>
                        <Button variant="secondary" disabled={release.isPending || !quantity} onClick={() => release.mutate()}>
                          <Unlock className="h-4 w-4" /> Release
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Badge>Read-only role</Badge>
                  )}

                  <DataTable
                    data={selected.data.inventory_lots}
                    getKey={(lot) => lot.id}
                    emptyTitle="No active lots"
                    emptyDescription="This inventory record has no lots with quantity on hand."
                    columns={[
                      { header: "Lot", cell: (lot) => <span className="font-semibold text-slate-950">{lot.lot_code}</span> },
                      { header: "On hand", cell: (lot) => lot.quantity_on_hand },
                      { header: "Reserved", cell: (lot) => lot.quantity_reserved },
                      { header: "Unit cost", cell: (lot) => formatMoney(lot.unit_cost) },
                      { header: "Received", cell: (lot) => formatDate(lot.received_at) },
                      { header: "Decay", cell: (lot) => formatDate(lot.last_decay_applied_at) },
                    ]}
                  />
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </PageShell>
  );
}
