import { createClient as createServiceClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

/**
 * Check if a user email is a platform admin.
 */
export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

/**
 * Get the impersonation override for an admin user, if any.
 * Returns the target tenant_id if the admin is in "View As" mode, else null.
 */
export async function getImpersonationOverride(userId: string, userEmail: string): Promise<string | null> {
  if (!isAdminEmail(userEmail)) return null

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await svc
    .from('view_as_state')
    .select('target_tenant_id')
    .eq('user_id', userId)
    .single()

  return data?.target_tenant_id || null
}
