import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../api/client";
import { authApi } from "../api/leanstock";
import type { User, UserRole } from "../types/api";
import { Button } from "./ui/Button";
import { Field, Input, PasswordInput, Select } from "./ui/Fields";

const schema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  phone: z.string().optional(),
  role: z.enum(["MANAGER", "WAREHOUSE_OPERATOR", "AUDITOR"]),
});

type FormValues = z.infer<typeof schema>;

export function UserCreateForm({
  tenantId,
  onCreated,
}: {
  tenantId?: string | null;
  onCreated?: (user: User) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      phone: "",
      role: "WAREHOUSE_OPERATOR",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      authApi.registerUser({
        ...values,
        phone: values.phone || undefined,
        tenant_id: tenantId ?? undefined,
        role: values.role as Exclude<UserRole, "SYSTEM_ADMIN" | "COMPANY_ADMIN">,
      }),
    onSuccess: (user) => {
      form.reset();
      setServerError(null);
      onCreated?.(user);
    },
    onError: (error) => {
      setServerError(error instanceof ApiError ? error.message : "Could not create user.");
    },
  });

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
      {serverError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{serverError}</div> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={form.formState.errors.first_name?.message}>
          <Input {...form.register("first_name")} />
        </Field>
        <Field label="Last name" error={form.formState.errors.last_name?.message}>
          <Input {...form.register("last_name")} />
        </Field>
      </div>
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Temporary password" error={form.formState.errors.password?.message}>
        <PasswordInput autoComplete="new-password" {...form.register("password")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" error={form.formState.errors.phone?.message}>
          <Input {...form.register("phone")} placeholder="+77001234567" />
        </Field>
        <Field label="Role" error={form.formState.errors.role?.message}>
          <Select {...form.register("role")}>
            <option value="WAREHOUSE_OPERATOR">Warehouse operator</option>
            <option value="MANAGER">Manager</option>
            <option value="AUDITOR">Auditor</option>
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={mutation.isPending || (tenantId === null)}>
        {mutation.isPending ? "Creating..." : "Create user"}
      </Button>
    </form>
  );
}
