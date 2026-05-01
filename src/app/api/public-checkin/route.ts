import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public API — no auth required. For client self-check-in on Front Desk welcome screen.
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Search today's appointments by name or phone for check-in
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  const q = searchParams.get('q')?.trim()

  if (!slug || !q) {
    return NextResponse.json({ error: 'Missing slug or search query' }, { status: 400 })
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

  // Fetch today's non-cancelled appointments with client info
  const { data: appointments } = await svc
    .from('appointments')
    .select('id, start_time, end_time, status, checked_in_at, checked_out_at, client:clients(first_name, last_name, phone), service:services(name), staff_member:staff!staff_id(name)')
    .eq('tenant_id', tenant.id)
    .gte('start_time', `${todayStr}T00:00:00`)
    .lte('start_time', `${todayStr}T23:59:59`)
    .in('status', ['pending', 'confirmed'])
    .order('start_time', { ascending: true })

  if (!appointments) {
    return NextResponse.json({ appointments: [] })
  }

  // Filter by name or phone
  const searchLower = q.toLowerCase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = appointments.filter((a: any) => {
    const client = a.client
    if (!client) return false
    const fullName = `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase().trim()
    const phone = (client.phone || '').replace(/\D/g, '')
    const searchDigits = q.replace(/\D/g, '')
    return fullName.includes(searchLower) || (searchDigits.length >= 4 && phone.includes(searchDigits))
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = filtered.map((a: any) => ({
    id: a.id,
    start_time: a.start_time,
    end_time: a.end_time,
    status: a.status,
    checked_in_at: a.checked_in_at,
    checked_out_at: a.checked_out_at,
    client_name: `${a.client?.first_name || ''} ${a.client?.last_name || ''}`.trim(),
    service_name: a.service?.name || 'Service',
    staff_name: a.staff_member?.name || 'Any available',
  }))

  return NextResponse.json({ appointments: results })
}

// POST: Check in to an appointment
export async function POST(request: Request) {
  const body = await request.json()
  const { slug, appointment_id } = body

  if (!slug || !appointment_id) {
    return NextResponse.json({ error: 'Missing slug or appointment_id' }, { status: 400 })
  }

  const { data: tenant } = await svc
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  const { data: updated, error } = await svc
    .from('appointments')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('id', appointment_id)
    .eq('tenant_id', tenant.id)
    .is('checked_in_at', null)
    .select('id, checked_in_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, appointment: updated })
}
