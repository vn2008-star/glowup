import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
  if (!adminEmails.includes(user.email?.toLowerCase() || '')) return null
  return user
}

export async function GET() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const thisWeekStart = new Date(now.getTime() - 7 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()

  // ─── 1. Revenue & Subscriptions ───
  const { data: allTenants } = await svc
    .from('tenants')
    .select('id, name, slug, plan, is_active, subscription_status, trial_ends_at, stripe_subscription_id, stripe_price_id, created_at')

  const tenants = allTenants || []

  // Plan pricing map (monthly estimates)
  const planPricing: Record<string, number> = {
    starter: 29,
    growth: 59,
    professional: 99,
  }

  const paying = tenants.filter(t =>
    t.subscription_status === 'active' && t.plan !== 'free'
  )
  const mrr = paying.reduce((sum, t) => sum + (planPricing[t.plan] || 0), 0)

  const trialing = tenants.filter(t =>
    t.subscription_status === 'trialing' || (t.trial_ends_at && new Date(t.trial_ends_at) > now)
  )
  const trialExpiringSoon = trialing.filter(t =>
    t.trial_ends_at && new Date(t.trial_ends_at) <= new Date(now.getTime() + 7 * 86400000)
  )

  const planBreakdown: Record<string, number> = { free: 0, starter: 0, growth: 0, professional: 0 }
  tenants.forEach(t => {
    const p = t.plan || 'free'
    planBreakdown[p] = (planBreakdown[p] || 0) + 1
  })

  // New tenants by week (last 8 weeks)
  const weeklyGrowth: Array<{ week: string; count: number }> = []
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - (i + 1) * 7 * 86400000)
    const weekEnd = new Date(now.getTime() - i * 7 * 86400000)
    const label = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const count = tenants.filter(t => {
      const d = new Date(t.created_at)
      return d >= weekStart && d < weekEnd
    }).length
    weeklyGrowth.push({ week: label, count })
  }

  // ─── 2. Platform Analytics ───
  const { count: totalAppointments } = await svc
    .from('appointments')
    .select('*', { count: 'exact', head: true })

  const { count: monthlyAppointments } = await svc
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .gte('start_time', thisMonthStart)

  const { count: weeklyAppointments } = await svc
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .gte('start_time', thisWeekStart)

  const { count: totalClients } = await svc
    .from('clients')
    .select('*', { count: 'exact', head: true })

  const { count: totalStaff } = await svc
    .from('staff')
    .select('*', { count: 'exact', head: true })

  // Top salons by client count
  const { data: clientsByTenant } = await svc
    .from('clients')
    .select('tenant_id')

  const tenantClientMap: Record<string, number> = {}
  clientsByTenant?.forEach(c => {
    tenantClientMap[c.tenant_id] = (tenantClientMap[c.tenant_id] || 0) + 1
  })

  // Top salons by appointment count
  const { data: apptsByTenant } = await svc
    .from('appointments')
    .select('tenant_id')

  const tenantApptMap: Record<string, number> = {}
  apptsByTenant?.forEach(a => {
    tenantApptMap[a.tenant_id] = (tenantApptMap[a.tenant_id] || 0) + 1
  })

  const tenantNameMap: Record<string, string> = {}
  tenants.forEach(t => { tenantNameMap[t.id] = t.name })

  const topSalons = Object.entries(tenantClientMap)
    .map(([id, clients]) => ({
      id,
      name: tenantNameMap[id] || 'Unknown',
      clients,
      appointments: tenantApptMap[id] || 0,
    }))
    .sort((a, b) => b.clients - a.clients)
    .slice(0, 5)

  // ─── 3. Referral Pipeline ───
  const { data: referralCodes } = await svc
    .from('client_referral_codes')
    .select('id, code, uses, referrer_name, referrer_email, referred_salon_name, referred_owner_name, referred_owner_email, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: referralLogs } = await svc
    .from('referral_log')
    .select('id, referrer_tenant_id, referred_tenant_id, code, reward_applied, client_reward_status, client_reward_amount, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const referralStats = {
    totalCodes: referralCodes?.length || 0,
    totalReferrals: referralLogs?.length || 0,
    pendingRewards: referralLogs?.filter(r => r.client_reward_status === 'pending').length || 0,
    rewardedCount: referralLogs?.filter(r => r.client_reward_status === 'rewarded').length || 0,
    totalRewardAmount: referralLogs?.filter(r => r.client_reward_status === 'rewarded').reduce((s, r) => s + (Number(r.client_reward_amount) || 0), 0) || 0,
  }

  // ─── 4. GlowUp Credits ───
  const { data: credits } = await svc
    .from('glowup_credits')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  const { data: redemptions } = await svc
    .from('credit_redemptions')
    .select('*')
    .order('redeemed_at', { ascending: false })
    .limit(200)

  const creditStats = {
    totalIssued: credits?.length || 0,
    totalIssuedAmount: credits?.reduce((s, c) => s + (Number(c.original_amount) || Number(c.balance) || 0), 0) || 0,
    activeCredits: credits?.filter(c => c.status === 'active').length || 0,
    activeBalance: credits?.filter(c => c.status === 'active').reduce((s, c) => s + (Number(c.balance) || 0), 0) || 0,
    redeemedCount: credits?.filter(c => c.status === 'redeemed' || c.status === 'partially_redeemed').length || 0,
    totalRedeemed: redemptions?.reduce((s, r) => s + (Number(r.amount) || 0), 0) || 0,
    expiredCount: credits?.filter(c => c.status === 'expired').length || 0,
    expiringSoon: credits?.filter(c => {
      if (c.status !== 'active' || !c.expires_at) return false
      const exp = new Date(c.expires_at)
      return exp > now && exp <= new Date(now.getTime() + 30 * 86400000)
    }).length || 0,
  }

  // ─── 5. Tenant Health ───
  // Get recent appointment activity per tenant
  const { data: recentAppts } = await svc
    .from('appointments')
    .select('tenant_id, start_time')
    .gte('start_time', thirtyDaysAgo)

  const tenantRecentActivity: Record<string, number> = {}
  recentAppts?.forEach(a => {
    tenantRecentActivity[a.tenant_id] = (tenantRecentActivity[a.tenant_id] || 0) + 1
  })

  // Get new clients in last 30 days per tenant
  const { data: recentClients } = await svc
    .from('clients')
    .select('tenant_id')
    .gte('created_at', thirtyDaysAgo)

  const tenantNewClients: Record<string, number> = {}
  recentClients?.forEach(c => {
    tenantNewClients[c.tenant_id] = (tenantNewClients[c.tenant_id] || 0) + 1
  })

  // Check feature usage per tenant
  const { data: campaignTenants } = await svc.from('campaigns').select('tenant_id').limit(1000)
  const { data: giftCardTenants } = await svc.from('gift_cards').select('tenant_id').limit(1000)

  const campaignSet = new Set(campaignTenants?.map(c => c.tenant_id) || [])
  const giftCardSet = new Set(giftCardTenants?.map(g => g.tenant_id) || [])

  const tenantHealth = tenants.map(t => {
    const appts30d = tenantRecentActivity[t.id] || 0
    const newClients30d = tenantNewClients[t.id] || 0
    const clientsTotal = tenantClientMap[t.id] || 0
    const features: string[] = []
    if (campaignSet.has(t.id)) features.push('Campaigns')
    if (giftCardSet.has(t.id)) features.push('Gift Cards')
    if (clientsTotal > 0) features.push('CRM')

    // Health score: 0-100
    let score = 0
    if (appts30d > 0) score += 30
    if (appts30d >= 10) score += 15
    if (appts30d >= 30) score += 10
    if (newClients30d > 0) score += 15
    if (clientsTotal >= 5) score += 10
    if (features.length >= 2) score += 10
    if (t.plan !== 'free') score += 10

    let risk: 'healthy' | 'warning' | 'at_risk' = 'healthy'
    if (score < 30) risk = 'at_risk'
    else if (score < 50) risk = 'warning'

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      score,
      risk,
      appts30d,
      newClients30d,
      clientsTotal,
      features,
      created_at: t.created_at,
    }
  }).sort((a, b) => a.score - b.score)

  return NextResponse.json({
    revenue: {
      mrr,
      arr: mrr * 12,
      payingCount: paying.length,
      trialingCount: trialing.length,
      trialExpiringSoon: trialExpiringSoon.length,
      planBreakdown,
      weeklyGrowth,
    },
    analytics: {
      totalAppointments: totalAppointments || 0,
      monthlyAppointments: monthlyAppointments || 0,
      weeklyAppointments: weeklyAppointments || 0,
      totalClients: totalClients || 0,
      totalStaff: totalStaff || 0,
      topSalons,
    },
    referrals: {
      stats: referralStats,
      codes: referralCodes || [],
      logs: referralLogs || [],
    },
    credits: {
      stats: creditStats,
      credits: credits || [],
      redemptions: redemptions || [],
    },
    health: tenantHealth,
  })
}
