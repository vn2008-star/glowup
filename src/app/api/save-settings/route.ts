import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { authenticate, isAuthFailure } from '@/lib/api-auth'

// Columns the Settings UI may write on `tenants`. Spreading the raw body let a
// caller set any column (stripe_customer_id, subscription fields, ...).
const TENANT_WRITABLE = [
  'name', 'email', 'phone', 'address', 'website', 'timezone', 'logo_url', 'slug', 'settings',
] as const

export async function PUT(request: Request) {
  const caller = await authenticate()
  if (isAuthFailure(caller)) return caller.response

  if (!['owner', 'manager'].includes(caller.staffRole)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  for (const key of TENANT_WRITABLE) {
    if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key]
  }

  // The Settings page round-trips the whole settings object, but it only ever
  // received a REDACTED sms_gateway (credentials are stripped server-side).
  // Writing that back would overwrite the salon's gateway login/password with
  // the status stub, silently unhooking its phone. Carry the stored one over.
  if (updates.settings && typeof updates.settings === 'object') {
    const { data: current } = await svc
      .from('tenants')
      .select('settings')
      .eq('id', caller.tenantId)
      .single()
    const storedGateway = ((current?.settings || {}) as Record<string, unknown>).sms_gateway
    if (storedGateway) {
      updates.settings = { ...(updates.settings as Record<string, unknown>), sms_gateway: storedGateway }
    } else {
      delete (updates.settings as Record<string, unknown>).sms_gateway
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 })
  }

  const { error } = await svc
    .from('tenants')
    .update(updates)
    .eq('id', caller.tenantId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
