import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Public endpoint — no auth required
export async function POST(request: Request) {
  const { slug, email } = await request.json()

  if (!slug || !email) {
    return NextResponse.json({ error: 'Salon and email are required' }, { status: 400 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find the tenant by slug
  const { data: tenant } = await svc
    .from('tenants')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Salon not found' }, { status: 404 })
  }

  // Find the client by email at this tenant
  const { data: client } = await svc
    .from('clients')
    .select('id, name')
    .eq('tenant_id', tenant.id)
    .ilike('email', email.trim())
    .single()

  if (!client) {
    return NextResponse.json(
      { error: 'No account found with this email at this salon. Please use the email your salon has on file for you.' },
      { status: 404 }
    )
  }

  // Check if client already has a referral code
  const { data: existing } = await svc
    .from('client_referral_codes')
    .select('id, code')
    .eq('client_id', client.id)
    .eq('tenant_id', tenant.id)
    .single()

  if (existing) {
    return NextResponse.json({
      code: existing.code,
      clientName: client.name,
      salonName: tenant.name,
    })
  }

  // Generate a new code: CR-XXXXXX
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const code = 'CR-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  const { error: insertErr } = await svc
    .from('client_referral_codes')
    .insert({
      tenant_id: tenant.id,
      client_id: client.id,
      code,
    })

  if (insertErr) {
    // If unique constraint fails, retry with different code
    const code2 = 'CR-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const { error: retry } = await svc
      .from('client_referral_codes')
      .insert({ tenant_id: tenant.id, client_id: client.id, code: code2 })

    if (retry) {
      return NextResponse.json({ error: 'Failed to generate referral code' }, { status: 500 })
    }

    return NextResponse.json({
      code: code2,
      clientName: client.name,
      salonName: tenant.name,
    })
  }

  return NextResponse.json({
    code,
    clientName: client.name,
    salonName: tenant.name,
  })
}
