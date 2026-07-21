// Server page: fetches the overview payload during the server render so the
// first paint shows real numbers instead of "..." placeholders. The tenant
// resolution is shared with the layout via React.cache (one lookup/request).

import { createClient as createServiceClient } from "@supabase/supabase-js";
import OverviewClient from "./OverviewClient";
import { resolveDashboardContext } from "@/lib/tenant-server";
import { getDashboardOverview, type OverviewData } from "@/lib/overview-query";

export default async function DashboardOverviewPage() {
  let initialOverview: OverviewData | null = null;
  try {
    const ctx = await resolveDashboardContext();
    if (ctx.status === "ok") {
      const svc = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      initialOverview = await getDashboardOverview(svc, ctx.tenantId);
    }
  } catch {
    // Fall back to the client-side fetch on any server error.
  }

  return <OverviewClient initialOverview={initialOverview} />;
}
