import { createClient as createServiceClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

/**
 * Check if a user email is a platform admin.
 */
export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

/**
 * How long a "View As" session stays active before it expires on its own.
 *
 * Impersonation used to be permanent: activated_at was written by
 * /api/admin/impersonate and never read by anything, so an admin who closed the
 * tab without hitting Exit stayed inside that salon's dashboard indefinitely —
 * across logouts, and on every other device they logged in from.
 */
const VIEW_AS_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Get the impersonation override for an admin user, if any.
 * Returns the target tenant_id if the admin is in "View As" mode, else null.
 * Expired sessions are deleted and treated as absent.
 */
export async function getImpersonationOverride(userId: string, userEmail: string): Promise<string | null> {
  if (!isAdminEmail(userEmail)) return null

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // activated_at is present in prod — verified 2026-08-11 by probing PostgREST
  // directly, not by reading supabase/migrations (which has drifted before).
  // Still select('*') rather than naming the column: if it ever goes missing,
  // that should cost the expiry check, not 500 every admin's dashboard.
  const { data } = await svc
    .from('view_as_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data?.target_tenant_id) return null

  const activatedAt = data.activated_at ? new Date(data.activated_at).getTime() : null
  if (activatedAt === null) {
    console.warn('[impersonate] view_as_state.activated_at missing — View As expiry not enforced')
  } else if (Date.now() - activatedAt > VIEW_AS_TTL_MS) {
    await svc.from('view_as_state').delete().eq('user_id', userId)
    console.log(`[impersonate] View As expired for ${userEmail} after ${VIEW_AS_TTL_MS / 60000}m`)
    return null
  }

  return data.target_tenant_id
}
