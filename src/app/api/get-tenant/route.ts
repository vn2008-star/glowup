import { NextResponse } from 'next/server'
import { resolveDashboardContext } from '@/lib/tenant-server'

// Client-side refetch path (e.g. after saving Settings). First paint no longer
// hits this — the dashboard layout resolves the tenant server-side via the
// same resolveDashboardContext.
export async function GET() {
  const ctx = await resolveDashboardContext()

  if (ctx.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (ctx.status === 'no-tenant') {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
  }

  return NextResponse.json({
    staff: { ...ctx.staff, tenants: ctx.tenant },
    isImpersonating: ctx.isImpersonating,
    impersonatingTenantName: ctx.impersonatingTenantName || undefined,
    isPlatformAdmin: ctx.isPlatformAdmin,
  })
}
