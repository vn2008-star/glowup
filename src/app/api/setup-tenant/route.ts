import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const body = await request.json()
  const { userId, email, businessName, ownerName } = body

  if (!userId || !email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Use service role to bypass RLS
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check if user already has a staff record
  const { data: existingStaff } = await supabase
    .from('staff')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (existingStaff) {
    return NextResponse.json({ success: true, message: 'Already set up' })
  }

  // Create tenant
  const bName = businessName || ownerName || email.split('@')[0] || 'My Salon'
  const slug = bName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') +
    '-' + Math.random().toString(36).slice(2, 6)

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name: bName,
      slug,
      business_type: 'nail_salon',
      plan: 'free',
    })
    .select('id')
    .single()

  if (tenantError) {
    return NextResponse.json({ error: tenantError.message }, { status: 500 })
  }

  // Create staff record (owner)
  const { error: staffError } = await supabase
    .from('staff')
    .insert({
      tenant_id: tenant.id,
      user_id: userId,
      name: ownerName || email.split('@')[0] || 'Owner',
      role: 'owner',
      email,
    })

  if (staffError) {
    return NextResponse.json({ error: staffError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, tenantId: tenant.id })
}
