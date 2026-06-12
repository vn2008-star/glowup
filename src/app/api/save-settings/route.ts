import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImpersonationOverride } from '@/lib/admin'

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get tenant_id
  const { data: staffRecord } = await svc
    .from('staff')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single()

  // ─── Admin impersonation override ───
  const overrideTenantId = await getImpersonationOverride(user.id, user.email || '')
  const effectiveTenantId = overrideTenantId || staffRecord?.tenant_id
  const effectiveRole = overrideTenantId ? 'owner' : staffRecord?.role

  if (!effectiveTenantId || !['owner', 'manager'].includes(effectiveRole || '')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await request.json()

  const { error } = await svc
    .from('tenants')
    .update(body)
    .eq('id', effectiveTenantId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
