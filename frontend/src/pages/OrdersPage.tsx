import { ClipboardList } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Card, SectionHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/States";

export function OrdersPage() {
  return (
    <PageShell title="Orders and requests" description="The current backend schema and routes do not expose order/request entities.">
      <Card>
        <SectionHeader title="Backend capability gap" description="No Prisma order model and no `/orders` or `/requests` route were found." />
        <EmptyState
          title="Orders are not supported by this backend yet"
          description="This page is intentionally not wired to mock data. Add order/request endpoints to the API when the business workflow is ready, then this screen can become a real queue."
          action={<ClipboardList className="h-8 w-8 text-slate-400" />}
        />
      </Card>
    </PageShell>
  );
}
