import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Verify the current user is a platform admin
async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, email: null, reason: 'not_authenticated' } as const

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
  if (!adminEmails.includes(user.email?.toLowerCase() || '')) {
    return { user: null, email: user.email, reason: 'not_in_admin_list' } as const
  }

  return { user, email: user.email, reason: null } as const
}

// GET — list all tenants with stats
export async function GET() {
  const auth = await verifyAdmin()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized', your_email: auth.email || 'unknown', reason: auth.reason }, { status: 403 })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all tenants
  const { data: tenants, error } = await svc
    .from('tenants')
    .select('id, name, slug, business_type, plan, email, phone, is_active, deleted_at, deletion_scheduled_at, subscription_status, trial_ends_at, current_period_end, stripe_customer_id, stripe_subscription_id, stripe_price_id, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get staff counts per tenant
  const { data: staffCounts } = await svc
    .from('staff')
    .select('tenant_id')

  // Get client counts per tenant
  const { data: clientCounts } = await svc
    .from('clients')
    .select('tenant_id')

  // Build counts map
  const staffMap: Record<string, number> = {}
  const clientMap: Record<string, number> = {}

  staffCounts?.forEach(s => {
    staffMap[s.tenant_id] = (staffMap[s.tenant_id] || 0) + 1
  })
  clientCounts?.forEach(c => {
    clientMap[c.tenant_id] = (clientMap[c.tenant_id] || 0) + 1
  })

  // Get current month usage data
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  // Appointments this month (each generates ~1 SMS reminder)
  const { data: monthlyApts } = await svc
    .from('appointments')
    .select('tenant_id')
    .gte('start_time', monthStart.toISOString())

  const aptMap: Record<string, number> = {}
  monthlyApts?.forEach(a => {
    aptMap[a.tenant_id] = (aptMap[a.tenant_id] || 0) + 1
  })

  // Campaigns this month (track actual sent counts)
  const { data: monthlyCampaigns } = await svc
    .from('campaigns')
    .select('tenant_id, metrics, type')
    .gte('created_at', monthStart.toISOString())

  const campaignSendMap: Record<string, number> = {}
  monthlyCampaigns?.forEach(c => {
    const sent = (c.metrics as Record<string, number>)?.sent || 0
    campaignSendMap[c.tenant_id] = (campaignSendMap[c.tenant_id] || 0) + sent
  })

  const enriched = (tenants || []).map(t => ({
    ...t,
    staff_count: staffMap[t.id] || 0,
    client_count: clientMap[t.id] || 0,
    usage: {
      appointments_this_month: aptMap[t.id] || 0,
      campaign_sends_this_month: campaignSendMap[t.id] || 0,
    },
  }))

  return NextResponse.json({
    tenants: enriched,
    stats: {
      total: enriched.length,
      active: enriched.filter(t => t.is_active !== false && !t.deleted_at).length,
      suspended: enriched.filter(t => t.is_active === false && !t.deleted_at).length,
      pendingDeletion: enriched.filter(t => !!t.deletion_scheduled_at).length,
    },
  })
}

// POST — admin actions on a tenant
export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { action, tenant_id } = await request.json()

  if (!tenant_id) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  }

  if (action === 'disable') {
    const { error } = await svc
      .from('tenants')
      .update({ is_active: false })
      .eq('id', tenant_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'enable') {
    const { error } = await svc
      .from('tenants')
      .update({ is_active: true, deleted_at: null, deletion_scheduled_at: null })
      .eq('id', tenant_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'schedule-delete') {
    const deletionDate = new Date()
    deletionDate.setDate(deletionDate.getDate() + 30)

    const { error } = await svc
      .from('tenants')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        deletion_scheduled_at: deletionDate.toISOString(),
      })
      .eq('id', tenant_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, deletion_date: deletionDate.toISOString() })
  }

  if (action === 'cancel-delete') {
    const { error } = await svc
      .from('tenants')
      .update({ is_active: true, deleted_at: null, deletion_scheduled_at: null })
      .eq('id', tenant_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'hard-delete') {
    // Permanently delete tenant and all cascading data
    const { error } = await svc
      .from('tenants')
      .delete()
      .eq('id', tenant_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'get-settings') {
    const { data: settings } = await svc
      .from('platform_settings')
      .select('key, value')

    const result: Record<string, string> = {}
    settings?.forEach(s => { result[s.key] = s.value })
    return NextResponse.json(result)
  }

  if (action === 'update-settings') {
    const { key, value } = await request.clone().json()
    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key and value required' }, { status: 400 })
    }
    const { error } = await svc
      .from('platform_settings')
      .upsert({ key, value: String(value), updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
