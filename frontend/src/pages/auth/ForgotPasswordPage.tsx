import { useState } from "react";
import { Link } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../../api/client";
import { authApi } from "../../api/leanstock";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Fields";
import { AuthShell } from "./AuthShell";

const schema = z.object({ email: z.string().email("Enter a valid email") });

export function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  async function onSubmit(values: z.infer<typeof schema>) {
    setServerError(null);
    try {
      const result = await authApi.requestPasswordReset(values.email);
      setMessage(result.message);
      setResetToken(result.reset_token ?? null);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Could not request reset.");
    }
  }

  return (
    <AuthShell title="Reset access" description="The backend queues a password reset email and returns a dev token outside production.">
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        {serverError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{serverError}</div> : null}
        {message ? <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
        {resetToken ? (
          <Link className="block break-all rounded-md bg-white p-3 text-sm font-semibold text-teal-700 ring-1 ring-teal-100" to={`/reset-password?token=${resetToken}`}>
            Use development reset token
          </Link>
        ) : null}
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input autoComplete="email" {...form.register("email")} />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-teal-700">
            Back to login
          </Link>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Sending..." : "Send reset"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
