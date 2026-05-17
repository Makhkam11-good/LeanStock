import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../../api/leanstock";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Fields";
import { AuthShell } from "./AuthShell";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function verify(value = token) {
    if (!value) return;
    setStatus("loading");
    setMessage(null);
    try {
      await authApi.verifyEmail(value);
      setStatus("success");
      setMessage("Email verified. The company tenant is now active.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof ApiError ? error.message : "Verification failed.");
    }
  }

  useEffect(() => {
    const value = params.get("token");
    if (value) void verify(value);
  }, []);

  return (
    <AuthShell title="Verify email" description="Paste the token returned by the development backend or follow the email link.">
      <div className="space-y-4">
        {message ? (
          <div className={`rounded-md p-3 text-sm ${status === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
            {message}
          </div>
        ) : null}
        <Field label="Verification token">
          <Input value={token} onChange={(event) => setToken(event.target.value)} />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-teal-700">
            Back to login
          </Link>
          <Button onClick={() => verify()} disabled={status === "loading" || !token}>
            {status === "loading" ? "Verifying..." : "Verify"}
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
