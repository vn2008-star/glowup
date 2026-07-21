// Server page: fetches the client list during the server render (with the
// same technician-masking rules as /api/data) so the table paints immediately.

import { createClient as createServiceClient } from "@supabase/supabase-js";
import ClientsClient from "./ClientsClient";
import { resolveDashboardContext } from "@/lib/tenant-server";
import { getClientsList } from "@/lib/dashboard-queries";
import type { Client } from "@/lib/types";

export default async function ClientsPage() {
  let initialClients: Client[] | null = null;
  try {
    const ctx = await resolveDashboardContext();
    if (ctx.status === "ok") {
      const svc = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const settings = (ctx.tenant.settings || {}) as Record<string, unknown>;
      const mask = ctx.staff.role === "technician" && !!settings.client_protection;
      const { data } = await getClientsList(svc, ctx.tenantId, { mask });
      initialClients = data as Client[];
    }
  } catch {
    // Fall back to the client-side fetch on any server error.
  }

  return <ClientsClient initialClients={initialClients} />;
}
