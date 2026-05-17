import { AlertCircle, Loader2, PackageOpen } from "lucide-react";
import { ApiError } from "../../api/client";
import { Button } from "./Button";

export function LoadingState({
  title = "Loading",
  description = "Fetching the latest data.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <Loader2 className="mb-3 h-8 w-8 animate-spin text-teal-600" />
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <PackageOpen className="mb-3 h-8 w-8 text-slate-400" />
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 max-w-xl text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : "Something went wrong.";
  const code = error instanceof ApiError ? error.code : "ERROR";

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-900">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{code}</p>
          <p className="mt-1 text-sm">{message}</p>
          {onRetry ? (
            <Button variant="secondary" className="mt-3" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
