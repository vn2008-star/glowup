import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public API — no auth required. For walk-in waitlist on Front Desk welcome screen.
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Fetch today's waitlist + per-staff wait times for a business by slug
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

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentTime = now.getTime()

  // Get active staff
  const { data: staffList } = await svc
    .from('staff')
    .select('id, name, role')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)

  // Get waitlist entries created today with status 'waiting'
  const { data: entries } = await svc
    .from('waitlist')
    .select('id, client_id, service_id, staff_id, status, notes, created_at, client:clients(first_name, last_name), service:services(name, duration_minutes, price)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'waiting')
    .gte('created_at', `${todayStr}T00:00:00`)
    .order('created_at', { ascending: true })

  // Get today's confirmed/pending appointments per staff for wait-time estimation
  const { data: todayApts } = await svc
    .from('appointments')
    .select('staff_id, start_time, end_time, status')
    .eq('tenant_id', tenant.id)
    .gte('start_time', `${todayStr}T00:00:00`)
    .lte('start_time', `${todayStr}T23:59:59`)
    .in('status', ['pending', 'confirmed'])

  // Calculate per-staff busy minutes (time until their last appointment ends)
  const staffWaitMap: Record<string, number> = {}
  const activeStaff = (staffList || []).filter(s => s.role === 'technician' || s.role === 'manager' || s.role === 'owner')

  for (const staff of activeStaff) {
    // How long until this staff is free from current/upcoming appointments
    const staffApts = (todayApts || []).filter(a => a.staff_id === staff.id && new Date(a.end_time).getTime() > currentTime)
    const latestEnd = staffApts.reduce((max, a) => Math.max(max, new Date(a.end_time).getTime()), currentTime)
    const busyMinutes = Math.round((latestEnd - currentTime) / 60000)

    // Also add wait from waitlist entries ahead that target this staff (or "any" staff)
    const waitlistAhead = (entries || []).filter(e =>
      e.staff_id === staff.id || !e.staff_id
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const waitlistMinutes = waitlistAhead.reduce((sum, e) => sum + ((e.service as any)?.duration_minutes || 30), 0)

    staffWaitMap[staff.id] = busyMinutes + waitlistMinutes
  }

  // Build staff wait info for frontend
  const staffWaits = activeStaff.map(s => ({
    id: s.id,
    name: s.name,
    role: s.role,
    estimated_wait_minutes: staffWaitMap[s.id] || 0,
  })).sort((a, b) => a.estimated_wait_minutes - b.estimated_wait_minutes)

  // "Any Staff" wait = shortest staff wait
  const anyStaffWait = staffWaits.length > 0 ? staffWaits[0].estimated_wait_minutes : 0

  // Build queue
  const queue = (entries || []).map((entry, index) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svcEntry = entry.service as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffEntry = staffList?.find(s => s.id === entry.staff_id)

    // Wait for this person = their staff's wait, or any-staff wait if no preference
    const baseWait = entry.staff_id
      ? (staffWaitMap[entry.staff_id] || 0)
      : anyStaffWait

    // Add wait from people ahead in the same queue
    const peopleAhead = (entries || []).slice(0, index).filter(e =>
      e.staff_id === entry.staff_id || (!e.staff_id && !entry.staff_id)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aheadMinutes = peopleAhead.reduce((sum, e) => sum + ((e.service as any)?.duration_minutes || 30), 0)

    return {
      id: entry.id,
      position: index + 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client_name: `${(entry.client as any)?.first_name || 'Guest'} ${(entry.client as any)?.last_name || ''}`.trim(),
      service_name: svcEntry?.name || 'Service',
      staff_name: staffEntry?.name || 'Any Staff',
      staff_id: entry.staff_id,
      estimated_wait_minutes: Math.round(baseWait + aheadMinutes),
      created_at: entry.created_at,
    }
  })

  return NextResponse.json({ queue, count: queue.length, staffWaits, anyStaffWait })
}

// POST: Add a new walk-in to the waitlist
export async function POST(request: Request) {
  const body = await request.json()
  const { slug, client_name, client_phone, service_id, staff_id } = body

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
      staff_id: staff_id || null, // null = "Any Staff"
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
