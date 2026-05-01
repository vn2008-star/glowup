import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public API — no auth required. For walk-in waitlist on Front Desk welcome screen.
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Fetch today's waitlist for a business by slug
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
  }

  // Resolve tenant
  const { data: tenant } = await svc
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // Get today's date range
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // Get waitlist entries created today with status 'waiting'
  const { data: entries } = await svc
    .from('waitlist')
    .select('id, client_id, service_id, status, notes, created_at, client:clients(first_name, last_name), service:services(name, duration_minutes, price)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'waiting')
    .gte('created_at', `${todayStr}T00:00:00`)
    .order('created_at', { ascending: true })

  // Get today's confirmed/pending appointments for wait-time estimation
  const { data: todayApts } = await svc
    .from('appointments')
    .select('start_time, end_time, status')
    .eq('tenant_id', tenant.id)
    .gte('start_time', `${todayStr}T00:00:00`)
    .lte('start_time', `${todayStr}T23:59:59`)
    .in('status', ['pending', 'confirmed'])

  // Calculate estimated wait time per position
  // Base wait: average service duration of pending appointments ahead
  const currentTime = now.getTime()
  const pendingApts = (todayApts || []).filter(a => new Date(a.end_time).getTime() > currentTime)
  const avgDuration = pendingApts.length > 0
    ? pendingApts.reduce((sum, a) => {
        const dur = (new Date(a.end_time).getTime() - Math.max(new Date(a.start_time).getTime(), currentTime)) / 60000
        return sum + Math.max(dur, 0)
      }, 0) / Math.max(pendingApts.length, 1)
    : 30 // default 30 min if no data

  const queue = (entries || []).map((entry, index) => {
    // Each person ahead adds roughly the service duration or avg duration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svcEntry = entry.service as any
    const serviceDuration = svcEntry?.duration_minutes || avgDuration
    // Wait = sum of durations for people ahead + current busy time
    const busyMinutes = Math.max(0, ...pendingApts.map(a => (new Date(a.end_time).getTime() - currentTime) / 60000))
    const waitAhead = (entries || []).slice(0, index).reduce((sum, e) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dur = (e.service as any)?.duration_minutes || avgDuration
      return sum + dur
    }, 0)
    const estimatedWait = Math.round(Math.max(busyMinutes, 0) + waitAhead)

    return {
      id: entry.id,
      position: index + 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client_name: `${(entry.client as any)?.first_name || 'Guest'} ${(entry.client as any)?.last_name || ''}`.trim(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service_name: svcEntry?.name || 'Service',
      service_duration: serviceDuration,
      estimated_wait_minutes: estimatedWait,
      created_at: entry.created_at,
    }
  })

  return NextResponse.json({ queue, count: queue.length })
}

// POST: Add a new walk-in to the waitlist
export async function POST(request: Request) {
  const body = await request.json()
  const { slug, client_name, client_phone, service_id } = body

  if (!slug || !client_name?.trim()) {
    return NextResponse.json({ error: 'Missing required fields (slug, client_name)' }, { status: 400 })
  }

  // Resolve tenant
  const { data: tenant } = await svc
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // Create or find client
  const nameParts = client_name.trim().split(' ')
  const firstName = nameParts[0]
  const lastName = nameParts.slice(1).join(' ') || null

  let clientId: string | null = null

  // Try to find by phone
  if (client_phone?.trim()) {
    const { data: existing } = await svc
      .from('clients')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('phone', client_phone.trim())
      .maybeSingle()

    if (existing) clientId = existing.id
  }

  // Create new client if not found
  if (!clientId) {
    const { data: newClient } = await svc
      .from('clients')
      .insert({
        tenant_id: tenant.id,
        first_name: firstName,
        last_name: lastName,
        phone: client_phone?.trim() || null,
        source: 'walk-in',
        status: 'new',
      })
      .select('id')
      .single()

    clientId = newClient?.id || null
  }

  if (!clientId) {
    return NextResponse.json({ error: 'Failed to create client record' }, { status: 500 })
  }

  // Insert into waitlist
  const { data: entry, error } = await svc
    .from('waitlist')
    .insert({
      tenant_id: tenant.id,
      client_id: clientId,
      service_id: service_id || null,
      status: 'waiting',
      preferred_date: new Date().toISOString().slice(0, 10),
    })
    .select('id, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, entry })
}

// DELETE: Remove a waitlist entry (mark as expired)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const slug = searchParams.get('slug')

  if (!id || !slug) {
    return NextResponse.json({ error: 'Missing id or slug' }, { status: 400 })
  }

  const { data: tenant } = await svc
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  await svc
    .from('waitlist')
    .update({ status: 'expired' })
    .eq('id', id)
    .eq('tenant_id', tenant.id)

  return NextResponse.json({ success: true })
}
