import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public API — no auth required. Used by the /book/[slug] public booking page.
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Fetch public business info by slug
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
  }

  // Get tenant
  const { data: tenant, error: tErr } = await svc
    .from('tenants')
    .select('id, name, slug, phone, logo_url, address, settings')
    .eq('slug', slug)
    .single()

  if (tErr || !tenant) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // Get active services
  const { data: services } = await svc
    .from('services')
    .select('id, name, category, description, duration_minutes, price, sort_order, image_url')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  // Get active staff
  const { data: staff } = await svc
    .from('staff')
    .select('id, name, specialties, schedule')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)

  // Get existing appointments for availability checking (next 30 days)
  const now = new Date()
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const { data: appointments } = await svc
    .from('appointments')
    .select('staff_id, start_time, end_time, status')
    .eq('tenant_id', tenant.id)
    .gte('start_time', now.toISOString())
    .lte('start_time', thirtyDays.toISOString())
    .in('status', ['pending', 'confirmed'])

  return NextResponse.json({
    business: {
      name: tenant.name,
      slug: tenant.slug,
      phone: tenant.phone,
      logo_url: tenant.logo_url,
      address: tenant.address,
      hours: (tenant.settings as Record<string, unknown>)?.business_hours || null,
    },
    services: services || [],
    staff: staff || [],
    bookedSlots: (appointments || []).map(a => ({
      staff_id: a.staff_id,
      start: a.start_time,
      end: a.end_time,
    })),
  })
}

// POST: Create a booking (public — no auth)
export async function POST(request: Request) {
  const body = await request.json()
  const { slug, service_id, staff_id, start_time, duration_minutes, client_name, client_email, client_phone, notes, client_birthday } = body

  if (!slug || !service_id || !start_time || !client_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

  // Upsert client by email or phone
  let clientId: string | null = null
  const [firstName, ...lastParts] = client_name.trim().split(' ')
  const lastName = lastParts.join(' ') || null

  if (client_email) {
    const { data: existing } = await svc
      .from('clients')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('email', client_email)
      .single()

    if (existing) {
      clientId = existing.id
    }
  }

  if (!clientId && client_phone) {
    const { data: existing } = await svc
      .from('clients')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('phone', client_phone)
      .single()

    if (existing) {
      clientId = existing.id
    }
  }

  if (!clientId) {
    const { data: newClient } = await svc
      .from('clients')
      .insert({
        tenant_id: tenant.id,
        first_name: firstName,
        last_name: lastName,
        email: client_email || null,
        phone: client_phone || null,
        birthday: client_birthday || null,
        status: 'new',
      })
      .select('id')
      .single()

    clientId = newClient?.id || null
  } else if (client_birthday) {
    // Update existing client's birthday if provided
    await svc
      .from('clients')
      .update({ birthday: client_birthday })
      .eq('id', clientId)
  }

  // Create the appointment
  const start = new Date(start_time)
  const end = new Date(start.getTime() + (duration_minutes || 60) * 60 * 1000)

  // Get service price
  const { data: service } = await svc
    .from('services')
    .select('price')
    .eq('id', service_id)
    .single()

  const { data: appointment, error } = await svc
    .from('appointments')
    .insert({
      tenant_id: tenant.id,
      client_id: clientId,
      service_id,
      staff_id: staff_id || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'confirmed',
      total_price: service?.price || 0,
      notes: notes || null,
    })
    .select('id, start_time, end_time')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  return NextResponse.json({ success: true, appointment })
}

// PATCH: Update client birthday after booking (post-confirmation prompt)
export async function PATCH(request: Request) {
  const body = await request.json()
  const { slug, client_email, client_phone, birthday } = body

  if (!slug || !birthday || (!client_email && !client_phone)) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: tenant } = await svc
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // Find the client
  let query = svc.from('clients').update({ birthday }).eq('tenant_id', tenant.id)

  if (client_email) {
    query = query.eq('email', client_email)
  } else {
    query = query.eq('phone', client_phone)
  }

  await query

  return NextResponse.json({ success: true })
}
