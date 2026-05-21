import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../../api/client";
import { authApi } from "../../api/leanstock";
import { Button } from "../../components/ui/Button";
import { Field, Input, PasswordInput } from "../../components/ui/Fields";
import { AuthShell } from "./AuthShell";

const schema = z.object({
  token: z.string().min(20, "Reset token is required"),
  new_password: z.string().min(8, "Use at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { token: params.get("token") ?? "", new_password: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await authApi.resetPassword(values);
      setMessage(result.message);
      form.reset({ token: "", new_password: "" });
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Could not reset password.");
    }
  }

  return (
    <AuthShell title="Set new password" description="After a reset, the backend revokes all existing refresh tokens.">
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        {serverError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{serverError}</div> : null}
        {message ? <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
        <Field label="Reset token" error={form.formState.errors.token?.message}>
          <Input {...form.register("token")} />
        </Field>
        <Field label="New password" error={form.formState.errors.new_password?.message}>
          <PasswordInput autoComplete="new-password" {...form.register("new_password")} />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-teal-700">
            Back to login
          </Link>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving..." : "Reset password"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
