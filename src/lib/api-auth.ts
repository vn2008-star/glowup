// ─── Shared route authentication ───
//
// The pattern every authenticated route needs: verify the JWT locally, then
// resolve the caller's tenant from THEIR OWN staff record. Hand-rolling it per
// route is how /api/send-campaign ended up checking `if (!cookie)` and how
// /api/stripe/portal ended up trusting a tenantId from the request body.
//
// The rule this encodes: tenant identity is derived server-side from a verified
// session, never read from the request. A route that takes tenant_id from the
// body has no tenant isolation at all — the caller simply states who they are.

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { getImpersonationOverride, isAdminEmail } from '@/lib/admin'

export type AuthedCaller = {
  userId: string
  userEmail: string
  tenantId: string
  staffId: string
  /** 'owner' when a platform admin is impersonating this tenant. */
  staffRole: string
  isImpersonating: boolean
}

export type AuthFailure = { response: Response }

type StaffRecord = { id: string; tenant_id: string; role: string } | null

// The user→staff mapping barely ever changes, yet every /api/data call paid a
// DB round-trip for it before touching the query it actually wanted. Cache it
// per warm serverless instance with a short TTL — role/tenant changes propagate
// within a minute, and the keep-warm cron keeps instances (and this cache) live.
const staffCache = new Map<string, { rec: StaffRecord; at: number }>()
const STAFF_CACHE_TTL_MS = 60_000

export async function resolveStaffRecord(
  svc: SupabaseClient,
  userId: string
): Promise<StaffRecord> {
  const hit = staffCache.get(userId)
  if (hit && Date.now() - hit.at < STAFF_CACHE_TTL_MS) return hit.rec

  const { data } = await svc
    .from('staff')
    .select('id, tenant_id, role')
    .eq('user_id', userId)
    .single()

  // Cache misses too — a user with no staff row would otherwise re-query every call.
  staffCache.set(userId, { rec: (data as StaffRecord) || null, at: Date.now() })
  return (data as StaffRecord) || null
}

export function isAuthFailure(x: AuthedCaller | AuthFailure): x is AuthFailure {
  return (x as AuthFailure).response !== undefined
}

/**
 * Verify the session and resolve the caller's tenant.
 *
 * Returns either the caller, or `{ response }` to return immediately.
 * getClaims() verifies the JWT signature against a cached key rather than
 * round-tripping to the Auth server — see src/lib/supabase/middleware.ts.
 */
export async function authenticate(
  opts: { requireTenant?: boolean } = {}
): Promise<AuthedCaller | AuthFailure> {
  const { requireTenant = true } = opts

  const supabase = await createClient()

  let claims: { sub?: string; email?: string } | null = null
  try {
    const { data } = await supabase.auth.getClaims()
    claims = data?.claims ?? null
  } catch {
    return { response: Response.json({ error: 'Auth service unavailable' }, { status: 503 }) }
  }

  if (!claims?.sub) {
    return { response: Response.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const userId = claims.sub
  const userEmail = claims.email || ''

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const staffRecord = await resolveStaffRecord(svc, userId)

  // Skip the impersonation lookup for non-admins — it is a DB round trip.
  const overrideTenantId = isAdminEmail(userEmail)
    ? await getImpersonationOverride(userId, userEmail)
    : null

  const tenantId = overrideTenantId || staffRecord?.tenant_id

  if (requireTenant && !tenantId) {
    return { response: Response.json({ error: 'No tenant' }, { status: 404 }) }
  }

  return {
    userId,
    userEmail,
    tenantId: tenantId || '',
    staffId: staffRecord?.id || '',
    staffRole: overrideTenantId ? 'owner' : (staffRecord?.role || ''),
    isImpersonating: !!overrideTenantId,
  }
}
