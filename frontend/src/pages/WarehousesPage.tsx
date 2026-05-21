import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, MapPin, PowerOff, Trash2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../api/client";
import { locationApi, warehouseApi } from "../api/leanstock";
import { useAuth } from "../auth/AuthProvider";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, Input, Select } from "../components/ui/Fields";
import { ErrorState } from "../components/ui/States";
import { canManageWarehouses } from "../lib/roles";
import type { Location, Warehouse } from "../types/api";

const warehouseSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  country: z.string().min(1, "Country is required").max(100),
  city: z.string().min(1, "City is required").max(100),
  status: z.enum(["ACTIVE", "CLOSED", "MAINTENANCE"]).optional(),
});

const locationSchema = z.object({
  warehouse_id: z.string().min(1, "Warehouse is required"),
  name: z.string().min(1, "Name is required").max(200),
  address: z.string().optional(),
  capacity_units: z.coerce.number().int().positive("Capacity must be positive"),
});

type WarehouseValues = z.infer<typeof warehouseSchema>;
type LocationValues = z.infer<typeof locationSchema>;

function statusTone(status: Warehouse["status"]) {
  if (status === "ACTIVE") return "green";
  if (status === "MAINTENANCE") return "amber";
  return "neutral";
}

function WarehouseForm({ selected, onDone }: { selected: Warehouse | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<WarehouseValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: "", country: "", city: "", status: "ACTIVE" },
  });

  useEffect(() => {
    form.reset(
      selected
        ? { name: selected.name, country: selected.country, city: selected.city, status: selected.status }
        : { name: "", country: "", city: "", status: "ACTIVE" },
    );
  }, [form, selected]);

  const mutation = useMutation({
    mutationFn: (values: WarehouseValues) =>
      selected ? warehouseApi.update(selected.id, values) : warehouseApi.create(values),
    onSuccess: () => {
      setServerError(null);
      void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      onDone();
    },
    onError: (error) => setServerError(error instanceof ApiError ? error.message : "Could not save warehouse."),
  });

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
      {serverError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{serverError}</div> : null}
      <Field label="Name" error={form.formState.errors.name?.message}>
        <Input {...form.register("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country" error={form.formState.errors.country?.message}>
          <Input {...form.register("country")} />
        </Field>
        <Field label="City" error={form.formState.errors.city?.message}>
          <Input {...form.register("city")} />
        </Field>
      </div>
      {selected ? (
        <Field label="Status" error={form.formState.errors.status?.message}>
          <Select {...form.register("status")}>
            <option value="ACTIVE">Active</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : selected ? "Update warehouse" : "Create warehouse"}
        </Button>
        {selected ? (
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function LocationForm({
  warehouses,
  selected,
  onDone,
}: {
  warehouses: Warehouse[];
  selected: Location | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<LocationValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: { warehouse_id: "", name: "", address: "", capacity_units: 1000 },
  });

  useEffect(() => {
    form.reset(
      selected
        ? {
            warehouse_id: selected.warehouse_id,
            name: selected.name,
            address: selected.address ?? "",
            capacity_units: selected.capacity_units,
          }
        : { warehouse_id: warehouses[0]?.id ?? "", name: "", address: "", capacity_units: 1000 },
    );
  }, [form, selected, warehouses]);

  const mutation = useMutation({
    mutationFn: (values: LocationValues) =>
      selected ? locationApi.update(selected.id, values) : locationApi.create({ ...values, address: values.address || undefined }),
    onSuccess: () => {
      setServerError(null);
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
      void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      onDone();
    },
    onError: (error) => setServerError(error instanceof ApiError ? error.message : "Could not save location."),
  });

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
      {serverError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{serverError}</div> : null}
      <Field label="Warehouse" error={form.formState.errors.warehouse_id?.message}>
        <Select {...form.register("warehouse_id")}>
          <option value="">Select warehouse</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Location name" error={form.formState.errors.name?.message}>
        <Input {...form.register("name")} />
      </Field>
      <Field label="Address" error={form.formState.errors.address?.message}>
        <Input {...form.register("address")} />
      </Field>
      <Field label="Capacity units" error={form.formState.errors.capacity_units?.message}>
        <Input type="number" min="1" {...form.register("capacity_units")} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending || warehouses.length === 0}>
          {mutation.isPending ? "Saving..." : selected ? "Update location" : "Create location"}
        </Button>
        {selected ? (
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function WarehousesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = canManageWarehouses(user?.role);
  const [warehouseAfter, setWarehouseAfter] = useState<string | null>(null);
  const [locationAfter, setLocationAfter] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  const warehouses = useQuery({
    queryKey: ["warehouses", { warehouseAfter }],
    queryFn: () => warehouseApi.list({ limit: 50, after: warehouseAfter }),
  });

  const locations = useQuery({
    queryKey: ["locations", { warehouseId, locationAfter }],
    queryFn: () => locationApi.list({ limit: 50, warehouse_id: warehouseId || undefined, after: locationAfter }),
  });

  const closeWarehouse = useMutation({
    mutationFn: warehouseApi.close,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["warehouses"] }),
  });

  const hideWarehouse = useMutation({
    mutationFn: warehouseApi.hide,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["warehouses"] }),
  });

  const deleteLocation = useMutation({
    mutationFn: locationApi.remove,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["locations"] }),
  });

  const warehouseRows = warehouses.data?.data ?? [];

  return (
    <PageShell title="Warehouses" description="Warehouse and location CRUD using `/warehouses` and `/locations`. Deleting a warehouse is a backend soft hide.">
      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <SectionHeader title="Warehouses" description="Tenant-scoped warehouses, hidden records excluded by backend." />
            {(closeWarehouse.error || hideWarehouse.error) ? <ErrorState error={closeWarehouse.error ?? hideWarehouse.error} /> : null}
            <DataTable
              data={warehouses.data?.data}
              isLoading={warehouses.isLoading}
              error={warehouses.error}
              getKey={(warehouse) => warehouse.id}
              pagination={warehouses.data?.pagination}
              onLoadMore={() => setWarehouseAfter(warehouses.data?.pagination.next_cursor ?? null)}
              isFetchingMore={warehouses.isFetching}
              emptyTitle="No warehouses"
              emptyDescription="Create an active warehouse before adding locations."
              columns={[
                { header: "Name", cell: (warehouse) => <span className="font-semibold text-slate-950">{warehouse.name}</span> },
                { header: "City", cell: (warehouse) => `${warehouse.city}, ${warehouse.country}` },
                { header: "Status", cell: (warehouse) => <Badge tone={statusTone(warehouse.status)}>{warehouse.status}</Badge> },
                { header: "Locations", cell: (warehouse) => warehouse._count?.locations ?? 0 },
                {
                  header: "Actions",
                  width: "11rem",
                  cell: (warehouse) => canWrite ? (
                    <div className="flex flex-nowrap items-center justify-center gap-2">
                      <Button variant="secondary" className="h-10 w-10 shrink-0 !p-0" title="Edit warehouse" onClick={() => setSelectedWarehouse(warehouse)}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button variant="secondary" className="h-10 w-10 shrink-0 !p-0" title="Close warehouse" disabled={warehouse.status === "CLOSED" || closeWarehouse.isPending} onClick={() => closeWarehouse.mutate(warehouse.id)}>
                        <PowerOff className="h-4 w-4" />
                      </Button>
                      <Button variant="danger" className="h-10 w-10 shrink-0 !p-0" title="Hide warehouse" disabled={hideWarehouse.isPending} onClick={() => hideWarehouse.mutate(warehouse.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : <span className="text-xs text-slate-500">Read only</span>,
                },
              ]}
            />
          </Card>

          <Card>
            <SectionHeader title="Locations" description="Locations can be filtered by warehouse." />
            <div className="mb-4 max-w-md">
              <Field label="Warehouse filter">
                <Select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                  <option value="">All warehouses</option>
                  {warehouseRows.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            {deleteLocation.error ? <div className="mb-4"><ErrorState error={deleteLocation.error} /></div> : null}
            <DataTable
              data={locations.data?.data}
              isLoading={locations.isLoading}
              error={locations.error}
              getKey={(location) => location.id}
              pagination={locations.data?.pagination}
              onLoadMore={() => setLocationAfter(locations.data?.pagination.next_cursor ?? null)}
              isFetchingMore={locations.isFetching}
              emptyTitle="No locations"
              emptyDescription="Create locations inside active warehouses before receiving stock."
              columns={[
                { header: "Name", cell: (location) => <span className="font-semibold text-slate-950">{location.name}</span> },
                { header: "Warehouse", cell: (location) => location.warehouse?.name ?? location.warehouse_id },
                { header: "Volume", cell: (location) => `${location.current_volume} / ${location.capacity_units}` },
                { header: "Address", cell: (location) => location.address ?? "-" },
                {
                  header: "Actions",
                  width: "8rem",
                  cell: (location) => canWrite ? (
                    <div className="flex flex-nowrap items-center justify-center gap-2">
                      <Button variant="secondary" className="h-10 w-10 shrink-0 !p-0" title="Edit location" onClick={() => setSelectedLocation(location)}>
                        <MapPin className="h-4 w-4" />
                      </Button>
                      <Button variant="danger" className="h-10 w-10 shrink-0 !p-0" title="Delete location" disabled={deleteLocation.isPending} onClick={() => deleteLocation.mutate(location.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : <span className="text-xs text-slate-500">Read only</span>,
                },
              ]}
            />
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <SectionHeader
              title={canWrite ? (selectedWarehouse ? "Edit warehouse" : "Create warehouse") : "Read-only access"}
              description={canWrite ? "Warehouse names are unique inside a tenant." : "Your role can inspect warehouses but cannot mutate them."}
            />
            {canWrite ? <WarehouseForm selected={selectedWarehouse} onDone={() => setSelectedWarehouse(null)} /> : null}
          </Card>
          <Card>
            <SectionHeader
              title={canWrite ? (selectedLocation ? "Edit location" : "Create location") : "Location access"}
              description="Locations carry capacity and current volume; backend blocks deletes with inventory."
            />
            {canWrite ? <LocationForm warehouses={warehouseRows} selected={selectedLocation} onDone={() => setSelectedLocation(null)} /> : null}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
