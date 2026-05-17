import { Link } from "react-router-dom";
import { Boxes } from "lucide-react";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-slate-100 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <Link to="/login" className="mb-8 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-teal-600 text-white">
              <Boxes className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-bold text-slate-950">LeanStock</span>
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">SaaS inventory</span>
            </span>
          </Link>

          <div className="rounded-lg bg-white p-6 shadow-soft ring-1 ring-slate-200">
            <h1 className="text-2xl font-bold tracking-normal text-slate-950">{title}</h1>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
            <div className="mt-6">{children}</div>
          </div>
          {footer ? <div className="mt-5 text-center text-sm text-slate-600">{footer}</div> : null}
        </div>
      </section>

      <section className="hidden bg-teal-700 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-100">Inventory operations</p>
          <h2 className="mt-4 max-w-xl text-4xl font-bold tracking-normal">
            Multi-tenant stock control with live role boundaries.
          </h2>
          <p className="mt-4 max-w-lg text-base text-teal-50">
            The dashboard talks directly to the Express API: cursor pagination, JWT rotation, tenant scoping,
            and stock operations are all wired to backend contracts.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-white/10 p-4 ring-1 ring-white/15">
            <p className="text-2xl font-bold">4</p>
            <p className="mt-1 text-teal-50">RBAC roles</p>
          </div>
          <div className="rounded-lg bg-white/10 p-4 ring-1 ring-white/15">
            <p className="text-2xl font-bold">3</p>
            <p className="mt-1 text-teal-50">Stock actions</p>
          </div>
          <div className="rounded-lg bg-white/10 p-4 ring-1 ring-white/15">
            <p className="text-2xl font-bold">0</p>
            <p className="mt-1 text-teal-50">Mock APIs</p>
          </div>
        </div>
      </section>
    </main>
  );
}
