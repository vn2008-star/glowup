import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

/**
 * POST /api/admin/impersonate
 * Stores view-as impersonation state in Supabase (keyed by admin user ID).
 * Body: { tenant_id: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isAdmin(user.email || '')) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const body = await request.json()
  const { tenant_id } = body

  if (!tenant_id) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify tenant exists
  const { data: tenant } = await svc
    .from('tenants')
    .select('id, name')
    .eq('id', tenant_id)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  // Upsert view-as state (one row per admin)
  const { error } = await svc
    .from('view_as_state')
    .upsert({
      user_id: user.id,
      target_tenant_id: tenant_id,
      activated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('[impersonate] upsert failed:', error)
    return NextResponse.json({ error: 'Failed to activate impersonation' }, { status: 500 })
  }

  console.log(`[impersonate] Admin ${user.email} now viewing as tenant: ${tenant.name} (${tenant_id})`)
  return NextResponse.json({ success: true, viewing_as: { tenant_id, tenant_name: tenant.name } })
}

/**
 * DELETE /api/admin/impersonate
 * Clears the view-as state, returning admin to their own session.
 */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await svc.from('view_as_state').delete().eq('user_id', user.id)

  console.log(`[impersonate] Admin ${user.email} exited impersonation mode`)
  return NextResponse.json({ success: true })
}
