import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImpersonationOverride } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Use service role to bypass RLS for tenant lookup
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ─── Admin impersonation: check for View As override ───
  const overrideTenantId = await getImpersonationOverride(user.id, user.email || '')

  if (overrideTenantId) {
    // Admin is impersonating — return the target tenant's data
    const { data: tenant } = await serviceSupabase
      .from('tenants')
      .select('*')
      .eq('id', overrideTenantId)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Impersonated tenant not found' }, { status: 404 })
    }

    // Get the target tenant's owner staff record (so the greeting shows the salon owner's name)
    const { data: ownerStaff } = await serviceSupabase
      .from('staff')
      .select('*')
      .eq('tenant_id', overrideTenantId)
      .eq('role', 'owner')
      .limit(1)
      .single()

    // Build a synthetic staff record pointing to the impersonated tenant
    const syntheticStaff = {
      ...(ownerStaff || { id: user.id, name: 'Admin', role: 'owner', tenant_id: overrideTenantId }),
      tenants: tenant,
    }

    return NextResponse.json({
      staff: syntheticStaff,
      isImpersonating: true,
      impersonatingTenantName: tenant.name,
    })
  }

  // Normal flow — return the user's own tenant
  const { data: staffRecord, error } = await serviceSupabase
    .from('staff')
    .select('*, tenants(*)')
    .eq('user_id', user.id)
    .single()

  if (error || !staffRecord) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
  }

  return NextResponse.json({ staff: staffRecord, isImpersonating: false })
}
