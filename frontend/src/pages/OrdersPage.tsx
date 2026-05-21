import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, PackagePlus, Send, Truck } from "lucide-react";
import { ApiError } from "../api/client";
import { locationApi, productApi, purchaseOrderApi, supplierApi } from "../api/leanstock";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, Input, Select, Textarea } from "../components/ui/Fields";
import { ErrorState } from "../components/ui/States";
import { formatMoney } from "../lib/format";
import type { PurchaseOrder, PurchaseOrderLine } from "../types/api";

export function OrdersPage() {
  const queryClient = useQueryClient();
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [unitCost, setUnitCost] = useState(1);
  const [notes, setNotes] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => supplierApi.list({ limit: 50, is_active: "true" }) });
  const products = useQuery({ queryKey: ["products", "po"], queryFn: () => productApi.list({ limit: 100, is_discontinued: "false" }) });
  const locations = useQuery({ queryKey: ["locations", "po"], queryFn: () => locationApi.list({ limit: 100 }) });
  const orders = useQuery({ queryKey: ["purchase-orders"], queryFn: () => purchaseOrderApi.list({ limit: 50 }) });

  const firstReceivableLine = (order: PurchaseOrder): PurchaseOrderLine | undefined =>
    order.lines?.find((line) => line.quantity_received < line.quantity_ordered);

  const activeSuppliers = suppliers.data?.data ?? [];
  const productOptions = products.data?.data ?? [];
  const locationOptions = locations.data?.data ?? [];
  const selectedSupplier = activeSuppliers.find((supplier) => supplier.id === selectedSupplierId);
  const supplierTenantId = selectedSupplier?.tenant_id;
  const filteredProductOptions = supplierTenantId
    ? productOptions.filter((product) => product.tenant_id === supplierTenantId)
    : [];
  const filteredLocationOptions = supplierTenantId
    ? locationOptions.filter((location) => location.warehouse?.tenant_id === supplierTenantId)
    : [];
  const selectedProductValid = filteredProductOptions.some((product) => product.id === selectedProductId);
  const selectedLocationValid = filteredLocationOptions.some((location) => location.id === selectedLocationId);

  const canCreateOrder = useMemo(
    () => Boolean(selectedSupplierId && selectedProductValid && selectedLocationValid && quantity > 0 && unitCost > 0),
    [selectedSupplierId, selectedProductValid, selectedLocationValid, quantity, unitCost],
  );

  const supplierMutation = useMutation({
    mutationFn: () => supplierApi.create({
      name: supplierName,
      contact_email: supplierEmail || undefined,
      lead_time_days: 7,
    }),
    onSuccess: (supplier) => {
      setServerError(null);
      setSupplierName("");
      setSupplierEmail("");
      setSelectedSupplierId(supplier.id);
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error) => setServerError(error instanceof ApiError ? error.message : "Could not create supplier."),
  });

  const orderMutation = useMutation({
    mutationFn: () => purchaseOrderApi.create({
      supplier_id: selectedSupplierId,
      notes: notes || undefined,
      lines: [{
        product_id: selectedProductId,
        location_id: selectedLocationId,
        quantity_ordered: quantity,
        unit_cost: unitCost,
      }],
    }),
    onSuccess: () => {
      setServerError(null);
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (error) => setServerError(error instanceof ApiError ? error.message : "Could not create purchase order."),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ order, action }: { order: PurchaseOrder; action: "submit" | "approve" | "cancel" | "receive" }) => {
      if (action === "submit") return purchaseOrderApi.submit(order.id);
      if (action === "approve") return purchaseOrderApi.approve(order.id);
      if (action === "cancel") return purchaseOrderApi.cancel(order.id);
      const line = firstReceivableLine(order);
      if (!line) throw new Error("Nothing left to receive.");
      return purchaseOrderApi.receive(order.id, {
        lines: [{
          line_id: line.id,
          quantity_received: line.quantity_ordered - line.quantity_received,
          lot_code: `PO-${order.id.slice(-6)}-${Date.now()}`,
        }],
      });
    },
    onSuccess: () => {
      setServerError(null);
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error) => setServerError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Action failed."),
  });

  return (
    <PageShell
      title="Purchase orders"
      description="Supplier sourcing, purchase order approvals, receiving, and inventory updates backed by the live API."
    >
      {serverError ? <ErrorState error={serverError} /> : null}
      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <SectionHeader title="Purchase order queue" description="Status changes call `/purchase-orders/:id/*` and receiving updates inventory lots." />
          <DataTable
            data={orders.data?.data}
            isLoading={orders.isLoading}
            error={orders.error}
            emptyTitle="No purchase orders"
            emptyDescription="Create a supplier and purchase order to start the replenishment workflow."
            getKey={(order) => order.id}
            columns={[
              { header: "Supplier", cell: (order) => order.supplier?.name ?? order.supplier_id },
              { header: "Status", cell: (order) => <Badge tone={order.status === "RECEIVED" ? "green" : order.status === "CANCELLED" ? "red" : "blue"}>{order.status}</Badge> },
              {
                header: "Lines",
                cell: (order) => order.lines?.map((line) => `${line.product?.sku ?? line.product_id}: ${line.quantity_received}/${line.quantity_ordered}`).join(", ") || "-",
              },
              {
                header: "Total",
                cell: (order) => formatMoney((order.lines ?? []).reduce((sum, line) => sum + Number(line.unit_cost) * line.quantity_ordered, 0)),
              },
              {
                header: "Actions",
                width: "9rem",
                cell: (order) => (
                  <div className="flex flex-col items-center gap-2">
                    {order.status === "DRAFT" ? (
                      <Button variant="secondary" className="w-28" onClick={() => transitionMutation.mutate({ order, action: "submit" })}>
                        <Send className="h-4 w-4" /> Submit
                      </Button>
                    ) : null}
                    {order.status === "SUBMITTED" ? (
                      <Button variant="secondary" className="w-28" onClick={() => transitionMutation.mutate({ order, action: "approve" })}>
                        <ClipboardCheck className="h-4 w-4" /> Approve
                      </Button>
                    ) : null}
                    {order.status === "APPROVED" ? (
                      <Button variant="secondary" className="w-28" onClick={() => transitionMutation.mutate({ order, action: "receive" })}>
                        <Truck className="h-4 w-4" /> Receive
                      </Button>
                    ) : null}
                    {["DRAFT", "SUBMITTED", "APPROVED"].includes(order.status) ? (
                      <Button variant="ghost" className="w-28" onClick={() => transitionMutation.mutate({ order, action: "cancel" })}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </Card>

        <div className="space-y-6">
          <Card>
            <SectionHeader title="Supplier" description="Create an active supplier with an optional real email address for PO notifications." />
            <div className="space-y-3">
              <Field label="Supplier name">
                <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Northwind Wholesale" />
              </Field>
              <Field label="Supplier email">
                <Input value={supplierEmail} onChange={(event) => setSupplierEmail(event.target.value)} placeholder="orders@example.com" />
              </Field>
              <Button disabled={!supplierName || supplierMutation.isPending} onClick={() => supplierMutation.mutate()}>
                <PackagePlus className="h-4 w-4" /> Create supplier
              </Button>
            </div>
          </Card>

          <Card>
            <SectionHeader title="New purchase order" description="One-line order form for the defense demo flow." />
            <div className="space-y-3">
              <Field label="Supplier">
                <Select
                  value={selectedSupplierId}
                  onChange={(event) => {
                    setSelectedSupplierId(event.target.value);
                    setSelectedProductId("");
                    setSelectedLocationId("");
                  }}
                >
                  <option value="">Select supplier</option>
                  {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </Select>
              </Field>
              <Field label="Product">
                <Select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} disabled={!selectedSupplierId}>
                  <option value="">{selectedSupplierId ? "Select product" : "Select supplier first"}</option>
                  {filteredProductOptions.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
                </Select>
              </Field>
              <Field label="Receiving location">
                <Select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} disabled={!selectedSupplierId}>
                  <option value="">{selectedSupplierId ? "Select location" : "Select supplier first"}</option>
                  {filteredLocationOptions.map((location) => <option key={location.id} value={location.id}>{location.warehouse?.name ?? "Warehouse"} / {location.name}</option>)}
                </Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Quantity">
                  <Input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
                </Field>
                <Field label="Unit cost">
                  <Input type="number" min="0.01" step="0.01" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
              </Field>
              <Button disabled={!canCreateOrder || orderMutation.isPending} onClick={() => orderMutation.mutate()}>
                Create purchase order
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
