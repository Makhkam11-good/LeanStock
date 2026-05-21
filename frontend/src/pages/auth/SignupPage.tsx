import { useState } from "react";
import { Link } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authApi } from "../../api/leanstock";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, PasswordInput } from "../../components/ui/Fields";
import { AuthShell } from "./AuthShell";

const schema = z.object({
  company_name: z.string().min(1, "Company name is required").max(200),
  company_slug: z.string().regex(/^[a-zA-Z0-9-]+$/, "Use letters, numbers, and dashes").optional().or(z.literal("")),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  phone: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function SignupPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name: "",
      company_slug: "",
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      phone: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await authApi.signup({
        ...values,
        company_slug: values.company_slug || undefined,
        phone: values.phone || undefined,
      });
      setVerificationToken(result.verification_token ?? null);
      form.reset();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Could not create workspace.");
    }
  }

  return (
    <AuthShell
      title="Create company workspace"
      description="Signup creates an inactive tenant and a company admin account until email verification succeeds."
      footer={
        <>
          Already verified?{" "}
          <Link className="font-semibold text-teal-700 hover:text-teal-800" to="/login">
            Sign in
          </Link>
        </>
      }
    >
      {verificationToken ? (
        <div className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Workspace created. Verification is required.</p>
          <p className="mt-1">Development backend returned a token:</p>
          <code className="mt-2 block break-all rounded bg-white p-2 text-xs text-slate-700">{verificationToken}</code>
          <Link className="mt-3 inline-flex font-semibold text-teal-700" to={`/verify-email?token=${verificationToken}`}>
            Verify now
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          {serverError ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{serverError}</div> : null}
          <Field label="Company name" error={form.formState.errors.company_name?.message}>
            <Input {...form.register("company_name")} placeholder="Acme Logistics" />
          </Field>
          <Field label="Company slug" error={form.formState.errors.company_slug?.message}>
            <Input {...form.register("company_slug")} placeholder="acme-logistics" />
          </Field>
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
          <Field label="Password" error={form.formState.errors.password?.message}>
            <PasswordInput autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field label="Phone" error={form.formState.errors.phone?.message}>
            <Input {...form.register("phone")} placeholder="+77001234567" />
          </Field>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating..." : "Create workspace"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
