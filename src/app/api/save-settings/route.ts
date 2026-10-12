import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { authenticate, isAuthFailure } from '@/lib/api-auth'

// Columns the Settings UI may write on `tenants`. Spreading the raw body let a
// caller set any column (stripe_customer_id, subscription fields, ...).
const TENANT_WRITABLE = [
  'name', 'email', 'phone', 'address', 'website', 'timezone', 'logo_url', 'slug', 'settings',
] as const

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

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

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const updates: Record<string, unknown> = {}
  for (const key of TENANT_WRITABLE) {
    if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key]
  }

  // A bad zone makes every Intl formatter throw, which takes down Home,
  // Checkout, the waitlist, check-in and the booking page in one go.
  if (updates.timezone !== undefined) {
    const tz = updates.timezone
    if (typeof tz !== 'string' || !Intl.supportedValuesOf('timeZone').includes(tz)) {
      return NextResponse.json({ error: 'Unknown timezone' }, { status: 400 })
    }
  }
  // The slug is in every emailed booking and manage link; changing it breaks
  // them all, so it's the owner's call and must stay URL-safe.
  if (updates.slug !== undefined) {
    if (caller.staffRole !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can change the booking link' }, { status: 403 })
    }
    if (typeof updates.slug !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(updates.slug)) {
      return NextResponse.json({ error: 'Use 3–60 lowercase letters, numbers and hyphens' }, { status: 400 })
    }
  }

  // `settings` is a PATCH, merged into what is stored: every page used to
  // send its own stale copy of the whole blob, so saving Settings reverted
  // loyalty tiers, AI config and automations other pages had written since
  // the page loaded (and a toggle on one page undid a toggle on another).
  // Top-level keys merge; a key whose stored and incoming values are both
  // plain objects (automations, booking, reminder_templates, …) merges one
  // level deeper, so a caller can send just { automations: { auto_x: true } }.
  // Arrays and scalars replace. sms_gateway is never writable here — the page
  // only ever sees a redacted copy and would overwrite the stored login.
  if (updates.settings !== undefined) {
    if (!isPlainObject(updates.settings)) {
      return NextResponse.json({ error: 'settings must be an object' }, { status: 400 })
    }
    const { data: current } = await svc
      .from('tenants')
      .select('settings')
      .eq('id', caller.tenantId)
      .single()
    const stored = (isPlainObject(current?.settings) ? current!.settings : {}) as Record<string, unknown>
    const incoming = { ...(updates.settings as Record<string, unknown>) }
    delete incoming.sms_gateway
    const merged: Record<string, unknown> = { ...stored }
    for (const [k, v] of Object.entries(incoming)) {
      merged[k] = isPlainObject(v) && isPlainObject(stored[k])
        ? { ...(stored[k] as Record<string, unknown>), ...(v as Record<string, unknown>) }
        : v
    }
    updates.settings = merged
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
