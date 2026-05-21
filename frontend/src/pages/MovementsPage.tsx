import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Download, Upload } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../api/client";
import { inventoryApi, locationApi, productApi, stockMovementApi } from "../api/leanstock";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, Input, Select } from "../components/ui/Fields";
import { ErrorState } from "../components/ui/States";
import { compactId, formatDateTime } from "../lib/format";
import type { MovementStatus, MovementType, StockMovement } from "../types/api";

const receiveSchema = z.object({
  product_id: z.string().min(1, "Product is required"),
  location_id: z.string().min(1, "Location is required"),
  quantity: z.coerce.number().int().positive("Quantity must be positive"),
  unit_cost: z.coerce.number().positive("Unit cost must be positive"),
  lot_code: z.string().optional(),
  reason: z.string().optional(),
});

const transferSchema = z.object({
  product_id: z.string().min(1, "Product is required"),
  from_location_id: z.string().min(1, "Source is required"),
  to_location_id: z.string().min(1, "Destination is required"),
  quantity: z.coerce.number().int().positive("Quantity must be positive"),
  reason: z.string().optional(),
});

const sellSchema = z.object({
  product_id: z.string().min(1, "Product is required"),
  location_id: z.string().min(1, "Location is required"),
  quantity: z.coerce.number().int().positive("Quantity must be positive"),
  reason: z.string().optional(),
});

function MovementResult({ movement }: { movement: StockMovement | null }) {
  if (!movement) return null;
  return (
    <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-100">
      <p className="font-semibold">Movement completed</p>
      <p className="mt-1">
        {movement.movement_type} movement {compactId(movement.id)} for {movement.quantity} units.
      </p>
    </div>
  );
}

function movementTone(type: MovementType) {
  if (type === "INCOMING") return "green";
  if (type === "TRANSFER") return "blue";
  if (type === "OUTGOING") return "amber";
  if (type === "WRITE_OFF") return "red";
  return "neutral";
}

function statusTone(status: MovementStatus) {
  if (status === "COMPLETED" || status === "APPROVED") return "green";
  if (status === "REJECTED") return "red";
  if (status === "IN_TRANSIT") return "blue";
  return "amber";
}

function locationLabel(location: StockMovement["from_location"]) {
  if (!location) return "-";
  return location.warehouse?.name ? `${location.warehouse.name} / ${location.name}` : location.name;
}

export function MovementsPage() {
  const queryClient = useQueryClient();
  const [lastMovement, setLastMovement] = useState<StockMovement | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<"" | MovementType>("");
  const [movementStatus, setMovementStatus] = useState<"" | MovementStatus>("");
  const [after, setAfter] = useState<string | null>(null);

  const products = useQuery({ queryKey: ["products", "movement-options"], queryFn: () => productApi.list({ limit: 100 }) });
  const locations = useQuery({ queryKey: ["locations", "movement-options"], queryFn: () => locationApi.list({ limit: 100 }) });
  const movements = useQuery({
    queryKey: ["stock-movements", { movementType, movementStatus, after }],
    queryFn: () => stockMovementApi.list({
      limit: 20,
      movement_type: movementType || undefined,
      status: movementStatus || undefined,
      after,
    }),
  });

  const receiveForm = useForm<z.infer<typeof receiveSchema>>({
    resolver: zodResolver(receiveSchema),
    defaultValues: { product_id: "", location_id: "", quantity: 1, unit_cost: 1, lot_code: "", reason: "" },
  });
  const transferForm = useForm<z.infer<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: { product_id: "", from_location_id: "", to_location_id: "", quantity: 1, reason: "" },
  });
  const sellForm = useForm<z.infer<typeof sellSchema>>({
    resolver: zodResolver(sellSchema),
    defaultValues: { product_id: "", location_id: "", quantity: 1, reason: "SALE" },
  });

  const afterSuccess = (movement: StockMovement) => {
    setLastMovement(movement);
    setServerError(null);
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
    void queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
    setAfter(null);
  };

  const receive = useMutation({
    mutationFn: (values: z.infer<typeof receiveSchema>) => inventoryApi.receive({
      ...values,
      movement_type: "INCOMING",
      lot_code: values.lot_code || undefined,
      reason: values.reason || undefined,
    }),
    onSuccess: (result) => {
      receiveForm.reset({ product_id: "", location_id: "", quantity: 1, unit_cost: 1, lot_code: "", reason: "" });
      afterSuccess(result.movement);
    },
    onError: (error) => setServerError(error instanceof ApiError ? error.message : "Receive failed."),
  });

  const transfer = useMutation({
    mutationFn: (values: z.infer<typeof transferSchema>) => inventoryApi.transfer({ ...values, reason: values.reason || undefined }),
    onSuccess: (result) => {
      transferForm.reset({ product_id: "", from_location_id: "", to_location_id: "", quantity: 1, reason: "" });
      afterSuccess(result.movement);
    },
    onError: (error) => setServerError(error instanceof ApiError ? error.message : "Transfer failed."),
  });

  const sell = useMutation({
    mutationFn: (values: z.infer<typeof sellSchema>) => inventoryApi.sell({ ...values, reason: values.reason || undefined }),
    onSuccess: (result) => {
      sellForm.reset({ product_id: "", location_id: "", quantity: 1, reason: "SALE" });
      afterSuccess(result.movement);
    },
    onError: (error) => setServerError(error instanceof ApiError ? error.message : "Sale failed."),
  });

  const productOptions = products.data?.data ?? [];
  const locationOptions = locations.data?.data ?? [];

  return (
    <PageShell title="Stock movements" description="Receive, transfer, sell, and purchase-order receiving activity recorded from the live StockMovement table.">
      {serverError ? <ErrorState error={new ApiError(400, { code: "MOVEMENT_ERROR", message: serverError })} /> : null}
      <MovementResult movement={lastMovement} />

      <div className="grid min-w-0 gap-6 xl:grid-cols-2 2xl:grid-cols-3">
        <Card>
          <SectionHeader title="Receive stock" description="Creates incoming movement, inventory row, and lot." action={<Download className="h-5 w-5 text-teal-700" />} />
          <form className="space-y-4" onSubmit={receiveForm.handleSubmit((values) => receive.mutate(values))}>
            <Field label="Product" error={receiveForm.formState.errors.product_id?.message}>
              <Select {...receiveForm.register("product_id")}>
                <option value="">Select product</option>
                {productOptions.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
              </Select>
            </Field>
            <Field label="Location" error={receiveForm.formState.errors.location_id?.message}>
              <Select {...receiveForm.register("location_id")}>
                <option value="">Select location</option>
                {locationOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantity" error={receiveForm.formState.errors.quantity?.message}>
                <Input type="number" min="1" {...receiveForm.register("quantity")} />
              </Field>
              <Field label="Unit cost" error={receiveForm.formState.errors.unit_cost?.message}>
                <Input type="number" min="0" step="0.01" {...receiveForm.register("unit_cost")} />
              </Field>
            </div>
            <Field label="Lot code" error={receiveForm.formState.errors.lot_code?.message}>
              <Input {...receiveForm.register("lot_code")} placeholder="Optional" />
            </Field>
            <Field label="Reason" error={receiveForm.formState.errors.reason?.message}>
              <Input {...receiveForm.register("reason")} placeholder="Optional" />
            </Field>
            <Button type="submit" disabled={receive.isPending}>{receive.isPending ? "Receiving..." : "Receive"}</Button>
          </form>
        </Card>

        <Card>
          <SectionHeader title="Transfer stock" description="Atomic FIFO transfer between active locations." action={<ArrowRightLeft className="h-5 w-5 text-sky-700" />} />
          <form className="space-y-4" onSubmit={transferForm.handleSubmit((values) => transfer.mutate(values))}>
            <Field label="Product" error={transferForm.formState.errors.product_id?.message}>
              <Select {...transferForm.register("product_id")}>
                <option value="">Select product</option>
                {productOptions.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
              </Select>
            </Field>
            <Field label="From location" error={transferForm.formState.errors.from_location_id?.message}>
              <Select {...transferForm.register("from_location_id")}>
                <option value="">Source</option>
                {locationOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </Select>
            </Field>
            <Field label="To location" error={transferForm.formState.errors.to_location_id?.message}>
              <Select {...transferForm.register("to_location_id")}>
                <option value="">Destination</option>
                {locationOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </Select>
            </Field>
            <Field label="Quantity" error={transferForm.formState.errors.quantity?.message}>
              <Input type="number" min="1" {...transferForm.register("quantity")} />
            </Field>
            <Field label="Reason" error={transferForm.formState.errors.reason?.message}>
              <Input {...transferForm.register("reason")} placeholder="Optional" />
            </Field>
            <Button type="submit" disabled={transfer.isPending}>{transfer.isPending ? "Transferring..." : "Transfer"}</Button>
          </form>
        </Card>

        <Card>
          <SectionHeader title="Sell stock" description="Creates outgoing movement and increments product sold count." action={<Upload className="h-5 w-5 text-amber-700" />} />
          <form className="space-y-4" onSubmit={sellForm.handleSubmit((values) => sell.mutate(values))}>
            <Field label="Product" error={sellForm.formState.errors.product_id?.message}>
              <Select {...sellForm.register("product_id")}>
                <option value="">Select product</option>
                {productOptions.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
              </Select>
            </Field>
            <Field label="Location" error={sellForm.formState.errors.location_id?.message}>
              <Select {...sellForm.register("location_id")}>
                <option value="">Select location</option>
                {locationOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </Select>
            </Field>
            <Field label="Quantity" error={sellForm.formState.errors.quantity?.message}>
              <Input type="number" min="1" {...sellForm.register("quantity")} />
            </Field>
            <Field label="Reason" error={sellForm.formState.errors.reason?.message}>
              <Input {...sellForm.register("reason")} />
            </Field>
            <Button type="submit" disabled={sell.isPending}>{sell.isPending ? "Selling..." : "Sell stock"}</Button>
          </form>
        </Card>
      </div>

      <Card>
        <SectionHeader title="Movement history" description="Live cursor-paginated history from `/stock-movements`." />
        <div className="mb-4 grid gap-3 md:grid-cols-[180px_180px_auto]">
          <Field label="Type">
            <Select value={movementType} onChange={(event) => { setMovementType(event.target.value as "" | MovementType); setAfter(null); }}>
              <option value="">All types</option>
              <option value="INCOMING">Incoming</option>
              <option value="OUTGOING">Outgoing</option>
              <option value="TRANSFER">Transfer</option>
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="WRITE_OFF">Write off</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={movementStatus} onChange={(event) => { setMovementStatus(event.target.value as "" | MovementStatus); setAfter(null); }}>
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="IN_TRANSIT">In transit</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => { setMovementType(""); setMovementStatus(""); setAfter(null); }}>
              Reset
            </Button>
          </div>
        </div>
        <DataTable
          data={movements.data?.data}
          isLoading={movements.isLoading}
          error={movements.error}
          pagination={movements.data?.pagination}
          onLoadMore={() => setAfter(movements.data?.pagination.next_cursor ?? null)}
          isFetchingMore={movements.isFetching}
          getKey={(movement) => movement.id}
          emptyTitle="No movements yet"
          emptyDescription="Receive, transfer, sell, or receive a purchase order to create the first history row."
          columns={[
            { header: "Date", cell: (movement) => formatDateTime(movement.completed_at ?? movement.created_at) },
            { header: "Type", cell: (movement) => <Badge tone={movementTone(movement.movement_type)}>{movement.movement_type}</Badge> },
            { header: "Status", cell: (movement) => <Badge tone={statusTone(movement.status)}>{movement.status}</Badge> },
            { header: "Product", cell: (movement) => movement.product ? `${movement.product.sku} - ${movement.product.name}` : movement.product_id },
            { header: "From", cell: (movement) => locationLabel(movement.from_location) },
            { header: "To", cell: (movement) => locationLabel(movement.to_location) },
            { header: "Qty", width: "5rem", cell: (movement) => movement.quantity },
            { header: "Reason", cell: (movement) => movement.reason || "-" },
          ]}
        />
      </Card>
    </PageShell>
  );
}
