import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get tenant
  const { data: staff } = await supabase
    .from('staff')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single()

  if (!staff) return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
  const tenantId = staff.tenant_id

  // Get referral code
  const { data: code } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('tenant_id', tenantId)
    .single()

  // Get referral history
  const { data: history } = await supabase
    .from('referral_log')
    .select('*, referred_tenant:referred_tenant_id(name, created_at)')
    .eq('referrer_tenant_id', tenantId)
    .order('created_at', { ascending: false })

  // Get tenant info for generating code
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, slug, trial_ends_at, current_period_end')
    .eq('id', tenantId)
    .single()

  return NextResponse.json({
    code: code || null,
    history: history || [],
    tenant,
    stats: {
      totalReferrals: code?.uses || 0,
      monthsEarned: code?.uses || 0,
    },
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await request.json()

  // Get tenant
  const { data: staff } = await supabase
    .from('staff')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single()

  if (!staff) return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
  const tenantId = staff.tenant_id

  if (action === 'generate') {
    // Get tenant name for code
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()

    const baseName = (tenant?.name || 'SALON')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 12)
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase()
    const code = `GLOWUP-${baseName}-${suffix}`

    // Check if code already exists for this tenant
    const { data: existing } = await supabase
      .from('referral_codes')
      .select('id')
      .eq('tenant_id', tenantId)
      .single()

    if (existing) {
      // Regenerate
      const { data: updated, error } = await supabase
        .from('referral_codes')
        .update({ code })
        .eq('tenant_id', tenantId)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ code: updated })
    }

    // Create new
    const { data: created, error } = await supabase
      .from('referral_codes')
      .insert({ tenant_id: tenantId, code })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ code: created })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
