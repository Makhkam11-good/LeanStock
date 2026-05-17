import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../api/client";
import { authApi } from "../api/leanstock";
import { useAuth } from "../auth/AuthProvider";
import { PageShell } from "../components/PageShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionHeader } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Fields";
import { formatDate } from "../lib/format";
import { roleLabels } from "../lib/roles";

const schema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(8, "Use at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export function ProfilePage() {
  const { user, logout } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: "", new_password: "" },
  });

  const mutation = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: async (result) => {
      setMessage(result.message);
      setServerError(null);
      form.reset();
      await logout();
    },
    onError: (error) => {
      setServerError(error instanceof ApiError ? error.message : "Could not change password.");
    },
  });

  return (
    <PageShell title="Profile" description="Identity and password tools backed by `/auth/me` and `/auth/change-password`.">
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <SectionHeader title="Account" description="Current authenticated user." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">Name</p>
              <p className="font-semibold text-slate-950">{user?.first_name} {user?.last_name}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Email</p>
              <p className="font-semibold text-slate-950">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Role</p>
              {user ? <Badge tone={user.role === "SYSTEM_ADMIN" ? "violet" : "blue"}>{roleLabels[user.role]}</Badge> : null}
            </div>
            <div>
              <p className="text-sm text-slate-500">Tenant</p>
              <p className="font-semibold text-slate-950">{user?.tenant?.name ?? "Platform scope"}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Verified</p>
              <Badge tone={user?.is_email_verified ? "green" : "amber"}>{user?.is_email_verified ? "Verified" : "Pending"}</Badge>
            </div>
            <div>
              <p className="text-sm text-slate-500">Created</p>
              <p className="font-semibold text-slate-950">{formatDate(user?.created_at)}</p>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Change password" description="Backend revokes refresh tokens after password change, so you will sign in again." />
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            {serverError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{serverError}</div> : null}
            {message ? <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
            <Field label="Current password" error={form.formState.errors.current_password?.message}>
              <Input type="password" autoComplete="current-password" {...form.register("current_password")} />
            </Field>
            <Field label="New password" error={form.formState.errors.new_password?.message}>
              <Input type="password" autoComplete="new-password" {...form.register("new_password")} />
            </Field>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Change password"}
            </Button>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
