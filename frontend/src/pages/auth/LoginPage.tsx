import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Fields";
import { AuthShell } from "./AuthShell";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await login(values.email, values.password);
      const to = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";
      navigate(to, { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Could not sign in.");
    }
  }

  return (
    <AuthShell
      title="Sign in"
      description="Use a seeded account or a verified company account."
      footer={
        <>
          New company?{" "}
          <Link className="font-semibold text-teal-700 hover:text-teal-800" to="/signup">
            Create workspace
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        {serverError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{serverError}</div> : null}
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input autoComplete="email" {...form.register("email")} placeholder="manager@leanstock.com" />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...form.register("password")} placeholder="Password" />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <Link to="/forgot-password" className="text-sm font-semibold text-slate-600 hover:text-teal-700">
            Forgot password?
          </Link>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
