// ─── Server-side tenant resolution for the dashboard ───
//
// The dashboard used to resolve the tenant CLIENT-side: hydrate → getClaims →
// fetch /api/get-tenant → only then fetch page data. Two serial round-trips
// before any content. Resolving it here, in the server render, removes the
// first round-trip entirely and lets pages server-fetch their initial payload.
//
// Wrapped in React.cache so the layout and the page share ONE resolution per
// request — the second caller gets the memoized result.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImpersonationOverride, isAdminEmail } from '@/lib/admin'
import type { Tenant, Staff } from '@/lib/types'

export type DashboardContext =
  | { status: 'unauthenticated' }
  | { status: 'no-tenant'; isPlatformAdmin: boolean }
  | {
      status: 'ok'
      tenant: Tenant
      staff: Staff
      tenantId: string
      isImpersonating: boolean
      impersonatingTenantName: string | null
      isPlatformAdmin: boolean
    }

export const resolveDashboardContext = cache(async (): Promise<DashboardContext> => {
  const supabase = await createClient()

  let claims: { sub?: string; email?: string } | null = null
  try {
    const { data } = await supabase.auth.getClaims()
    claims = data?.claims ?? null
  } catch {
    return { status: 'unauthenticated' }
  }
  if (!claims?.sub) return { status: 'unauthenticated' }

  const userId = claims.sub
  const userEmail = claims.email || ''
  const isPlatformAdmin = isAdminEmail(userEmail)

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Admin impersonation: "View As" override ──
  const overrideTenantId = isPlatformAdmin
    ? await getImpersonationOverride(userId, userEmail)
    : null

  if (overrideTenantId) {
    const { data: tenant } = await svc
      .from('tenants')
      .select('*')
      .eq('id', overrideTenantId)
      .single()
    if (!tenant) return { status: 'no-tenant', isPlatformAdmin }

    const { data: ownerStaff } = await svc
      .from('staff')
      .select('*')
      .eq('tenant_id', overrideTenantId)
      .eq('role', 'owner')
      .limit(1)
      .single()

    const syntheticStaff = (ownerStaff ||
      { id: userId, name: 'Admin', role: 'owner', tenant_id: overrideTenantId }) as Staff

    return {
      status: 'ok',
      tenant: tenant as Tenant,
      staff: syntheticStaff,
      tenantId: overrideTenantId,
      isImpersonating: true,
      impersonatingTenantName: (tenant as Tenant).name,
      isPlatformAdmin,
    }
  }

  // ── Normal flow: the user's own staff row + its tenant ──
  const { data: staffRecord } = await svc
    .from('staff')
    .select('*, tenants(*)')
    .eq('user_id', userId)
    .single()

  if (!staffRecord || !staffRecord.tenants) {
    return { status: 'no-tenant', isPlatformAdmin }
  }

  const { tenants: tenant, ...staffOnly } = staffRecord as Record<string, unknown> & { tenants: Tenant }

  return {
    status: 'ok',
    tenant,
    staff: staffOnly as unknown as Staff,
    tenantId: tenant.id,
    isImpersonating: false,
    impersonatingTenantName: null,
    isPlatformAdmin,
  }
})
