import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Edit3, Plus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../api/client";
import { productApi } from "../api/leanstock";
import { useAuth } from "../auth/AuthProvider";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionHeader } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, Input, Select, Textarea } from "../components/ui/Fields";
import { ErrorState } from "../components/ui/States";
import { formatMoney } from "../lib/format";
import { canManageProducts } from "../lib/roles";
import type { Product } from "../types/api";

const productSchema = z.object({
  sku: z.string().min(1, "SKU is required").max(100),
  name: z.string().min(1, "Name is required").max(500),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required").max(100),
  base_price: z.coerce.number().positive("Base price must be positive"),
  discount_percentage: z.coerce.number().int().min(0).max(100),
});

type ProductFormValues = z.infer<typeof productSchema>;

function ProductForm({
  selected,
  onDone,
}: {
  selected: Product | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: "",
      name: "",
      description: "",
      category: "",
      base_price: 0,
      discount_percentage: 0,
    },
  });

  useEffect(() => {
    form.reset(
      selected
        ? {
            sku: selected.sku,
            name: selected.name,
            description: selected.description ?? "",
            category: selected.category,
            base_price: Number(selected.base_price),
            discount_percentage: selected.discount_percentage,
          }
        : {
            sku: "",
            name: "",
            description: "",
            category: "",
            base_price: 0,
            discount_percentage: 0,
          },
    );
  }, [form, selected]);

  const mutation = useMutation({
    mutationFn: (values: ProductFormValues) =>
      selected
        ? productApi.update(selected.id, {
            name: values.name,
            description: values.description || undefined,
            category: values.category,
            base_price: values.base_price,
            discount_percentage: values.discount_percentage,
          })
        : productApi.create({
            ...values,
            description: values.description || undefined,
          }),
    onSuccess: () => {
      setServerError(null);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onDone();
    },
    onError: (error) => setServerError(error instanceof ApiError ? error.message : "Could not save product."),
  });

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
      {serverError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{serverError}</div> : null}
      <Field label="SKU" error={form.formState.errors.sku?.message}>
        <Input {...form.register("sku")} disabled={Boolean(selected)} />
      </Field>
      <Field label="Name" error={form.formState.errors.name?.message}>
        <Input {...form.register("name")} />
      </Field>
      <Field label="Category" error={form.formState.errors.category?.message}>
        <Input {...form.register("category")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Base price" error={form.formState.errors.base_price?.message}>
          <Input type="number" step="0.01" min="0" {...form.register("base_price")} />
        </Field>
        <Field label="Discount %" error={form.formState.errors.discount_percentage?.message}>
          <Input type="number" min="0" max="100" {...form.register("discount_percentage")} />
        </Field>
      </div>
      <Field label="Description" error={form.formState.errors.description?.message}>
        <Textarea {...form.register("description")} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : selected ? "Update product" : "Create product"}
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

export function ProductsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = canManageProducts(user?.role);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [discontinued, setDiscontinued] = useState<"" | "true" | "false">("");
  const [after, setAfter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);

  const products = useQuery({
    queryKey: ["products", { search, category, discontinued, after }],
    queryFn: () => productApi.list({ limit: 20, search, category, is_discontinued: discontinued || undefined, after }),
  });

  const discontinueMutation = useMutation({
    mutationFn: productApi.discontinue,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  return (
    <PageShell
      title="Products"
      description="Catalog CRUD for tenant-scoped products. Create/update/discontinue endpoints require Company admin, Manager, or SYSTEM_ADMIN."
      actions={canWrite ? <Button onClick={() => setSelected(null)}><Plus className="h-4 w-4" /> New product</Button> : null}
    >
      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <SectionHeader title="Product catalog" description="Cursor-paginated list from `/products`." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
            <Field label="Search">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SKU or name" />
            </Field>
            <Field label="Category">
              <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Electronics" />
            </Field>
            <Field label="Status">
              <Select value={discontinued} onChange={(event) => setDiscontinued(event.target.value as "" | "true" | "false")}>
                <option value="">All</option>
                <option value="false">Active</option>
                <option value="true">Discontinued</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button variant="secondary" onClick={() => setAfter(null)}>
                Reset page
              </Button>
            </div>
          </div>
          {discontinueMutation.error ? <div className="mt-4"><ErrorState error={discontinueMutation.error} /></div> : null}
          <div className="mt-4">
            <DataTable
              data={products.data?.data}
              isLoading={products.isLoading}
              error={products.error}
              getKey={(product) => product.id}
              pagination={products.data?.pagination}
              onLoadMore={() => setAfter(products.data?.pagination.next_cursor ?? null)}
              isFetchingMore={products.isFetching}
              emptyTitle="No products"
              emptyDescription="Create a product before receiving stock."
              columns={[
                { header: "SKU", cell: (product) => <span className="font-semibold text-slate-950">{product.sku}</span> },
                { header: "Name", cell: (product) => product.name },
                { header: "Category", cell: (product) => product.category },
                { header: "Price", cell: (product) => formatMoney(product.base_price) },
                { header: "Discount", cell: (product) => `${product.discount_percentage}%` },
                { header: "Sold", cell: (product) => product.sold_count },
                { header: "Status", cell: (product) => <Badge tone={product.is_discontinued ? "amber" : "green"}>{product.is_discontinued ? "Discontinued" : "Active"}</Badge> },
                {
                  header: "Actions",
                  width: "8rem",
                  cell: (product) => canWrite ? (
                    <div className="flex flex-nowrap items-center justify-center gap-2">
                      <Button variant="secondary" className="h-10 w-10 shrink-0 !p-0" onClick={() => setSelected(product)} title="Edit product">
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="danger"
                        className="h-10 w-10 shrink-0 !p-0"
                        onClick={() => discontinueMutation.mutate(product.id)}
                        disabled={product.is_discontinued || discontinueMutation.isPending}
                        title="Discontinue product"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : <span className="text-xs text-slate-500">Read only</span>,
                },
              ]}
            />
          </div>
        </Card>

        <Card>
          <SectionHeader
            title={canWrite ? (selected ? "Edit product" : "Create product") : "Read-only access"}
            description={canWrite ? "Validated against backend product schema." : "Your role can inspect products but cannot mutate catalog records."}
          />
          {canWrite ? <ProductForm selected={selected} onDone={() => setSelected(null)} /> : null}
        </Card>
      </div>
    </PageShell>
  );
}
