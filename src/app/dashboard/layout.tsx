// Server layout: resolves the caller's tenant ON THE SERVER during the first
// render, so the client never pays the hydrate → /api/get-tenant round-trip
// before showing content. The interactive shell (sidebar, nav, theme) lives in
// DashboardLayoutClient; TenantProvider hydrates from the props passed here.
//
// resolveDashboardContext is React.cache-wrapped, so pages in this segment
// (e.g. the overview page) can call it again for free within the same request.

import DashboardLayoutClient from "./DashboardLayoutClient";
import { resolveDashboardContext } from "@/lib/tenant-server";
import type { TenantInitialData } from "@/lib/tenant-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialData: TenantInitialData | null = null;
  try {
    const ctx = await resolveDashboardContext();
    if (ctx.status === "ok") {
      initialData = {
        tenant: ctx.tenant,
        staff: ctx.staff,
        isImpersonating: ctx.isImpersonating,
        impersonatingTenantName: ctx.impersonatingTenantName,
        isPlatformAdmin: ctx.isPlatformAdmin,
      };
    }
    // 'unauthenticated' / 'no-tenant' → initialData stays null and the client
    // provider runs its existing flow (setup-tenant for new users, error UI,
    // middleware handles the auth redirect).
  } catch {
    // Fall back to the client-side flow on any server resolution error.
  }

  return (
    <DashboardLayoutClient initialData={initialData}>
      {children}
    </DashboardLayoutClient>
  );
}
