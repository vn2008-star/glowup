import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Unified data API — all dashboard queries go through here
// Authenticates via session cookies, queries with service role to bypass RLS
export async function POST(request: Request) {
  // Parse body and authenticate in parallel
  const [body, supabase] = await Promise.all([
    request.json(),
    createClient(),
  ])

  const { action, payload } = body

  let user
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 })
  }

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get tenant_id and staff role from staff record
  const { data: staffRecord } = await svc
    .from('staff')
    .select('id, tenant_id, role')
    .eq('user_id', user.id)
    .single()

  if (!staffRecord) {
    return NextResponse.json({ error: 'No tenant' }, { status: 404 })
  }

  const tenantId = staffRecord.tenant_id
  const staffRole = staffRecord.role
  const staffId = staffRecord.id

  // Helper: mask contact info for technicians when client protection is enabled
  async function shouldMaskContacts(): Promise<boolean> {
    if (staffRole !== 'technician') return false
    const { data: tenant } = await svc
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single()
    return !!(tenant?.settings as Record<string, unknown>)?.client_protection
  }

  function maskPhone(phone: string | null): string | null {
    if (!phone) return null
    return phone.replace(/\d(?=\d{4})/g, '•')
  }

  function maskEmail(email: string | null): string | null {
    if (!email) return null
    const [user, domain] = email.split('@')
    return `${user[0]}${'•'.repeat(Math.max(user.length - 1, 2))}@${domain}`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function maskClientData(client: any) {
    if (!client) return client
    return { ...client, phone: maskPhone(client.phone), email: maskEmail(client.email), _masked: true }
  }

  try {
    switch (action) {
      // ─── CLIENTS ───
      case 'clients.list': {
        const { data, error } = await svc
          .from('clients')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(payload?.limit || 200)

        if (await shouldMaskContacts()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const masked = (data || []).map((c: any) => maskClientData(c))
          return NextResponse.json({ data: masked, error: error?.message })
        }
        return NextResponse.json({ data, error: error?.message })
      }

      case 'clients.add': {
        const { data, error } = await svc
          .from('clients')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'clients.update': {
        const { id, ...fields } = payload
        const { data, error } = await svc
          .from('clients')
          .update(fields)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'clients.delete': {
        const { error } = await svc
          .from('clients')
          .delete()
          .eq('id', payload.id)
          .eq('tenant_id', tenantId)
        return NextResponse.json({ success: !error, error: error?.message })
      }

      // ─── SERVICES ───
      case 'services.list': {
        const { data, error } = await svc
          .from('services')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('sort_order', { ascending: true })
        return NextResponse.json({ data, error: error?.message })
      }

      case 'services.add': {
        const { data, error } = await svc
          .from('services')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'services.update': {
        const { id, ...fields } = payload
        const { data, error } = await svc
          .from('services')
          .update(fields)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'services.delete': {
        const { error } = await svc
          .from('services')
          .delete()
          .eq('id', payload.id)
          .eq('tenant_id', tenantId)
        return NextResponse.json({ success: !error, error: error?.message })
      }

      // ─── APPOINTMENTS ───
      case 'appointments.list': {
        let query = svc
          .from('appointments')
          .select('*, client:clients(*), staff_member:staff!staff_id(*), service:services(*)')
          .eq('tenant_id', tenantId)
          .order('start_time', { ascending: true })

        if (payload?.date) {
          // Legacy single-date param (kept for backwards compatibility)
          const dateStr = payload.date;
          query = query.gte('start_time', `${dateStr}T00:00:00`).lte('start_time', `${dateStr}T23:59:59`)
        }

        if (payload?.startDate && payload?.endDate) {
          // Client sends timezone-aware ISO strings — pass directly
          query = query.gte('start_time', payload.startDate).lte('start_time', payload.endDate)
        }

        const { data, error } = await query.limit(payload?.limit || 200)

        if (await shouldMaskContacts()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const masked = (data || []).map((a: any) => ({ ...a, client: maskClientData(a.client) }))
          return NextResponse.json({ data: masked, error: error?.message })
        }
        return NextResponse.json({ data, error: error?.message })
      }

      case 'appointments.add': {
        const { data, error } = await svc
          .from('appointments')
          .insert({ ...payload, tenant_id: tenantId })
          .select('*, client:clients(*), staff_member:staff!staff_id(*), service:services(*)')
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'appointments.update': {
        const { id, ...fields } = payload
        const { data, error } = await svc
          .from('appointments')
          .update(fields)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select('*, client:clients(*), staff_member:staff!staff_id(*), service:services(*)')
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'appointments.delete': {
        const { error } = await svc
          .from('appointments')
          .delete()
          .eq('id', payload.id)
          .eq('tenant_id', tenantId)
        return NextResponse.json({ success: !error, error: error?.message })
      }

      // ─── STAFF ───
      case 'staff.list': {
        const { data, error } = await svc
          .from('staff')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('name')
        return NextResponse.json({ data, error: error?.message })
      }

      case 'staff.add': {
        const { data, error } = await svc
          .from('staff')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'staff.update': {
        const { id, ...fields } = payload
        const { data, error } = await svc
          .from('staff')
          .update(fields)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'staff.delete': {
        const { error } = await svc
          .from('staff')
          .delete()
          .eq('id', payload.id)
          .eq('tenant_id', tenantId)
        return NextResponse.json({ success: !error, error: error?.message })
      }

      case 'staff.verify-pin': {
        const { staff_id, pin } = payload
        const { data, error } = await svc
          .from('staff')
          .select('id, pin')
          .eq('id', staff_id)
          .eq('tenant_id', tenantId)
          .single()
        if (error) return NextResponse.json({ data: { valid: false }, error: error.message })
        // If no PIN set, allow access
        if (!data.pin) return NextResponse.json({ data: { valid: true, no_pin: true } })
        return NextResponse.json({ data: { valid: data.pin === pin } })
      }

      case 'staff.set-pin': {
        const { id, pin } = payload
        const { data, error } = await svc
          .from('staff')
          .update({ pin: pin || null })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      // ─── CAMPAIGNS ───
      case 'campaigns.list': {
        const { data, error } = await svc
          .from('campaigns')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
        return NextResponse.json({ data, error: error?.message })
      }

      case 'campaigns.add': {
        const { data, error } = await svc
          .from('campaigns')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'campaigns.update': {
        const { id, ...fields } = payload
        const { data, error } = await svc
          .from('campaigns')
          .update(fields)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'campaigns.delete': {
        const { error } = await svc
          .from('campaigns')
          .delete()
          .eq('id', payload.id)
          .eq('tenant_id', tenantId)
        return NextResponse.json({ success: !error, error: error?.message })
      }

      // ─── SERVICE HISTORY ───
      case 'service_history.list': {
        let query = svc
          .from('service_history')
          .select('*, staff_member:staff!staff_id(id, name), service:services(id, name, category)')
          .eq('tenant_id', tenantId)
          .order('date', { ascending: false })

        if (payload?.client_id) {
          query = query.eq('client_id', payload.client_id)
        }

        const { data, error } = await query.limit(payload?.limit || 50)
        return NextResponse.json({ data, error: error?.message })
      }

      case 'service_history.add': {
        const { data, error } = await svc
          .from('service_history')
          .insert({ ...payload, tenant_id: tenantId })
          .select('*, staff_member:staff!staff_id(id, name), service:services(id, name, category)')
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'service_history.update': {
        const { id, ...fields } = payload
        const { data, error } = await svc
          .from('service_history')
          .update(fields)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select('*, staff_member:staff!staff_id(id, name), service:services(id, name, category)')
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      // ─── SOCIAL POSTS ───
      case 'social.list': {
        let query = svc
          .from('social_posts')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })

        if (payload?.status) {
          query = query.eq('status', payload.status)
        }

        if (payload?.month && payload?.year) {
          const startOfMonth = new Date(payload.year, payload.month - 1, 1).toISOString()
          const endOfMonth = new Date(payload.year, payload.month, 0, 23, 59, 59).toISOString()
          query = query.or(`scheduled_at.gte.${startOfMonth},created_at.gte.${startOfMonth}`)
            .or(`scheduled_at.lte.${endOfMonth},created_at.lte.${endOfMonth}`)
        }

        const { data, error } = await query.limit(payload?.limit || 100)
        return NextResponse.json({ data, error: error?.message })
      }

      case 'social.add': {
        const { data, error } = await svc
          .from('social_posts')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'social.update': {
        const { id, ...fields } = payload
        const { data, error } = await svc
          .from('social_posts')
          .update(fields)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'social.delete': {
        const { error } = await svc
          .from('social_posts')
          .delete()
          .eq('id', payload.id)
          .eq('tenant_id', tenantId)
        return NextResponse.json({ success: !error, error: error?.message })
      }

      // ─── CONVERSATIONS / INBOX ───
      case 'conversations.list': {
        let query = svc
          .from('conversations')
          .select('*, client:clients(id, first_name, last_name, phone, email)')
          .eq('tenant_id', tenantId)
          .order('last_message_at', { ascending: false })

        if (payload?.status) {
          query = query.eq('status', payload.status)
        }

        const { data, error } = await query.limit(payload?.limit || 50)
        return NextResponse.json({ data, error: error?.message })
      }

      case 'conversations.add': {
        const { data, error } = await svc
          .from('conversations')
          .insert({ ...payload, tenant_id: tenantId })
          .select('*, client:clients(id, first_name, last_name, phone, email)')
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'conversations.update': {
        const { id, ...fields } = payload
        const { data, error } = await svc
          .from('conversations')
          .update(fields)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'messages.list': {
        const { data, error } = await svc
          .from('messages')
          .select('*')
          .eq('conversation_id', payload.conversation_id)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
          .limit(payload?.limit || 100)
        return NextResponse.json({ data, error: error?.message })
      }

      case 'messages.add': {
        const { data: msg, error } = await svc
          .from('messages')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()

        // Update conversation last_message
        if (msg) {
          await svc
            .from('conversations')
            .update({
              last_message: msg.content,
              last_message_at: msg.created_at,
              unread_count: payload.sender_type === 'client' ? 1 : 0,
            })
            .eq('id', msg.conversation_id)
        }

        return NextResponse.json({ data: msg, error: error?.message })
      }

      // ─── LOYALTY ───
      case 'loyalty.overview': {
        // Get tier config from tenant settings
        const { data: tenant } = await svc
          .from('tenants')
          .select('settings')
          .eq('id', tenantId)
          .single()

        const settings = (tenant?.settings || {}) as Record<string, unknown>
        const tiers = (settings.loyalty_tiers as Array<{ name: string; minPoints: number; perks: string }>) || [
          { name: 'Bronze', minPoints: 0, perks: '5% off on birthday' },
          { name: 'Silver', minPoints: 200, perks: '10% off birthday + free add-on' },
          { name: 'Gold', minPoints: 500, perks: '15% off + priority booking + free upgrade' },
          { name: 'Platinum', minPoints: 1000, perks: '20% off + VIP + exclusive services' },
        ]

        // Count clients in each tier
        const { data: clients } = await svc
          .from('clients')
          .select('loyalty_points')
          .eq('tenant_id', tenantId)

        const tierCounts = tiers.map((tier, i) => {
          const nextMin = i < tiers.length - 1 ? tiers[i + 1].minPoints : Infinity
          const count = (clients || []).filter(c =>
            c.loyalty_points >= tier.minPoints && c.loyalty_points < nextMin
          ).length
          return { ...tier, clients: count }
        })

        // Recent loyalty activity: last 10 completed appointments (as point-earning events)
        const { data: recentApts } = await svc
          .from('appointments')
          .select('id, total_price, created_at, client:clients(first_name, last_name)')
          .eq('tenant_id', tenantId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(10)

        const totalPoints = (clients || []).reduce((sum, c) => sum + (c.loyalty_points || 0), 0)

        return NextResponse.json({
          data: { tiers: tierCounts, recentActivity: recentApts || [], totalPoints }
        })
      }

      case 'loyalty.update_tiers': {
        const { data: tenant } = await svc
          .from('tenants')
          .select('settings')
          .eq('id', tenantId)
          .single()

        const currentSettings = (tenant?.settings || {}) as Record<string, unknown>
        const { error } = await svc
          .from('tenants')
          .update({ settings: { ...currentSettings, loyalty_tiers: payload.tiers } })
          .eq('id', tenantId)

        return NextResponse.json({ success: !error, error: error?.message })
      }

      // ─── DASHBOARD OVERVIEW ───
      case 'dashboard.overview': {
        const today = new Date()
        const todayStr = today.toISOString().split('T')[0]
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
        const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)

        // Fire ALL queries in parallel instead of sequentially
        const [
          todayAptsRes,
          totalClientsRes,
          newClientsWeekRes,
          recentClientsRes,
          atRiskRes,
          activeClientsRes,
          unreadConvosRes,
        ] = await Promise.all([
          svc.from('appointments')
            .select('*, client:clients(*), service:services(*), staff_member:staff!staff_id(*)')
            .eq('tenant_id', tenantId)
            .gte('start_time', `${todayStr}T00:00:00`)
            .lte('start_time', `${todayStr}T23:59:59`)
            .order('start_time'),
          svc.from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId),
          svc.from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('created_at', weekAgo.toISOString()),
          svc.from('clients')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(5),
          svc.from('clients')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('status', 'at_risk')
            .limit(5),
          svc.from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('last_visit', sixtyDaysAgo.toISOString()),
          svc.from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gt('unread_count', 0),
        ])

        const todayApts = todayAptsRes.data || []
        const totalClients = totalClientsRes.count || 0
        const todayRevenue = todayApts
          .filter(a => a.status === 'completed')
          .reduce((sum, a) => sum + (a.total_price || 0), 0)
        const pendingCount = todayApts.filter(a => a.status === 'pending' || a.status === 'confirmed').length
        const retentionRate = totalClients ? Math.round(((activeClientsRes.count || 0) / totalClients) * 100) : 0

        return NextResponse.json({
          data: {
            todayAppointments: todayApts,
            todayRevenue,
            pendingCount,
            totalClients,
            newClientsWeek: newClientsWeekRes.count || 0,
            retentionRate,
            recentClients: recentClientsRes.data || [],
            atRiskClients: atRiskRes.data || [],
            unreadConvos: unreadConvosRes.count || 0,
          }
        })
      }

      // ─── REPORTS ───
      case 'reports.overview': {
        const now = new Date()
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

        // Fire ALL queries in parallel instead of sequentially
        const [
          thisMonthAptsRes,
          lastMonthAptsRes,
          thisMonthNewRes,
          lastMonthNewRes,
          servicesRes,
          staffListRes,
          noShowsRes,
          totalAptsRes,
        ] = await Promise.all([
          svc.from('appointments')
            .select('total_price, status, service_id, staff_id')
            .eq('tenant_id', tenantId)
            .gte('start_time', thisMonthStart)
            .eq('status', 'completed'),
          svc.from('appointments')
            .select('total_price')
            .eq('tenant_id', tenantId)
            .gte('start_time', lastMonthStart)
            .lte('start_time', lastMonthEnd)
            .eq('status', 'completed'),
          svc.from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('created_at', thisMonthStart),
          svc.from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('created_at', lastMonthStart)
            .lte('created_at', lastMonthEnd),
          svc.from('services')
            .select('id, name')
            .eq('tenant_id', tenantId),
          svc.from('staff')
            .select('id, name')
            .eq('tenant_id', tenantId),
          svc.from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('start_time', thisMonthStart)
            .eq('status', 'no_show'),
          svc.from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('start_time', thisMonthStart),
        ])

        const thisMonthApts = thisMonthAptsRes.data || []
        const lastMonthApts = lastMonthAptsRes.data || []
        const services = servicesRes.data || []
        const staffList = staffListRes.data || []

        const thisRevenue = thisMonthApts.reduce((s, a) => s + (a.total_price || 0), 0)
        const lastRevenue = lastMonthApts.reduce((s, a) => s + (a.total_price || 0), 0)

        // Top services
        const serviceCounts: Record<string, { name: string; bookings: number; revenue: number }> = {}
        for (const apt of thisMonthApts) {
          const svcName = services.find(s => s.id === apt.service_id)?.name || 'Unknown'
          if (!serviceCounts[svcName]) serviceCounts[svcName] = { name: svcName, bookings: 0, revenue: 0 }
          serviceCounts[svcName].bookings++
          serviceCounts[svcName].revenue += apt.total_price || 0
        }
        const topServices = Object.values(serviceCounts)
          .sort((a, b) => b.bookings - a.bookings)
          .slice(0, 5)

        // Staff performance
        const staffPerf: Record<string, { name: string; appointments: number; revenue: number }> = {}
        for (const apt of thisMonthApts) {
          const name = staffList.find(s => s.id === apt.staff_id)?.name || 'Unassigned'
          if (!staffPerf[name]) staffPerf[name] = { name, appointments: 0, revenue: 0 }
          staffPerf[name].appointments++
          staffPerf[name].revenue += apt.total_price || 0
        }
        const staffPerformance = Object.values(staffPerf)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5)

        const noShowRate = totalAptsRes.count ? Math.round(((noShowsRes.count || 0) / totalAptsRes.count) * 100) : 0

        return NextResponse.json({
          data: {
            thisMonth: {
              revenue: thisRevenue,
              appointments: thisMonthApts.length,
              newClients: thisMonthNewRes.count || 0,
            },
            lastMonth: {
              revenue: lastRevenue,
              appointments: lastMonthApts.length,
              newClients: lastMonthNewRes.count || 0,
            },
            topServices,
            staffPerformance,
            noShowRate,
          }
        })
      }

      // ─── WAITLIST ───
      case 'waitlist.list': {
        const { data, error } = await svc
          .from('waitlist')
          .select('*, client:clients(id, first_name, last_name, phone, email), service:services(id, name, price), staff_member:staff!staff_id(id, name)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
        return NextResponse.json({ data, error: error?.message })
      }

      case 'waitlist.add': {
        const { data, error } = await svc
          .from('waitlist')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'waitlist.update': {
        const { id, ...fields } = payload
        const { data, error } = await svc
          .from('waitlist')
          .update(fields)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'waitlist.delete': {
        const { error } = await svc
          .from('waitlist')
          .delete()
          .eq('id', payload.id)
          .eq('tenant_id', tenantId)
        return NextResponse.json({ success: !error, error: error?.message })
      }

      // ─── PACKAGES ───
      case 'packages.list': {
        const { data, error } = await svc
          .from('packages')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
        return NextResponse.json({ data, error: error?.message })
      }

      case 'packages.add': {
        const { data, error } = await svc
          .from('packages')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'packages.update': {
        const { id, ...fields } = payload
        const { data, error } = await svc
          .from('packages')
          .update(fields)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'packages.delete': {
        const { error } = await svc
          .from('packages')
          .delete()
          .eq('id', payload.id)
          .eq('tenant_id', tenantId)
        return NextResponse.json({ success: !error, error: error?.message })
      }

      // ─── GIFT CARDS ───
      case 'giftcards.list': {
        const { data, error } = await svc
          .from('gift_cards')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
        return NextResponse.json({ data, error: error?.message })
      }

      case 'giftcards.create': {
        const code = Array.from({ length: 12 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
        const { data, error } = await svc
          .from('gift_cards')
          .insert({ ...payload, code, tenant_id: tenantId })
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'giftcards.redeem': {
        const { code: redeemCode, amount } = payload
        const { data: card, error: findErr } = await svc
          .from('gift_cards')
          .select('*')
          .eq('code', redeemCode)
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
          .single()
        if (findErr || !card) return NextResponse.json({ data: null, error: 'Gift card not found or inactive' })
        if (card.balance < amount) return NextResponse.json({ data: null, error: `Insufficient balance. Available: $${card.balance}` })
        const newBalance = card.balance - amount
        const newStatus = newBalance <= 0 ? 'redeemed' : 'active'
        const { data, error } = await svc
          .from('gift_cards')
          .update({ balance: newBalance, status: newStatus })
          .eq('id', card.id)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      // ─── SERVICE HISTORY ───
      case 'service-history.list': {
        const { client_id } = payload
        const { data, error } = await svc
          .from('service_history')
          .select('*, staff_member:staff!staff_id(id, name), service:services(id, name, category)')
          .eq('tenant_id', tenantId)
          .eq('client_id', client_id)
          .order('date', { ascending: false })
          .limit(50)
        return NextResponse.json({ data, error: error?.message })
      }

      case 'service-history.add': {
        const { data, error } = await svc
          .from('service_history')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'service-history.update': {
        const { id: shId, ...shFields } = payload
        const { data, error } = await svc
          .from('service_history')
          .update(shFields)
          .eq('id', shId)
          .eq('tenant_id', tenantId)
          .select()
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      // ─── GALLERY (before/after photos from service_history) ───
      case 'gallery.list': {
        const { data, error } = await svc
          .from('service_history')
          .select('*, staff_member:staff!staff_id(id, name), service:services(id, name, category), client:clients(id, first_name, last_name)')
          .eq('tenant_id', tenantId)
          .or('before_photo_urls.neq.{},after_photo_urls.neq.{}')
          .order('date', { ascending: false })
          .limit(payload?.limit || 50)
        return NextResponse.json({ data, error: error?.message })
      }

      case 'gallery.create': {
        const { data, error } = await svc
          .from('service_history')
          .insert({
            tenant_id: tenantId,
            client_id: payload.client_id || null,
            staff_id: payload.staff_id || null,
            service_id: payload.service_id || null,
            appointment_id: payload.appointment_id || null,
            date: payload.date || new Date().toISOString().split('T')[0],
            notes: payload.notes || null,
            formula: payload.formula || null,
            before_photo_urls: payload.before_photo_urls || [],
            after_photo_urls: payload.after_photo_urls || [],
            satisfaction: payload.satisfaction || null,
            total_paid: payload.total_paid || 0,
          })
          .select('*')
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'gallery.delete': {
        const { error } = await svc
          .from('service_history')
          .delete()
          .eq('id', payload.id)
          .eq('tenant_id', tenantId)
        return NextResponse.json({ success: !error, error: error?.message })
      }

      // ─── ADVANCED REPORTS ───
      case 'reports.staff-performance': {
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

        const [aptsRes, staffRes] = await Promise.all([
          svc.from('appointments').select('*').eq('tenant_id', tenantId)
            .gte('start_time', monthStart).lte('start_time', monthEnd),
          svc.from('staff').select('id, name, schedule, commission_rate, is_active, specialties').eq('tenant_id', tenantId)
        ])

        const apts = aptsRes.data || []
        const staffList = staffRes.data || []
        const perfMap: Record<string, {
          id: string; name: string; specialties: string[];
          appointments: number; revenue: number; completed: number;
          cancelled: number; noShows: number; commissionRate: number;
          clients: Set<string>;
        }> = {}

        for (const s of staffList) {
          perfMap[s.id] = {
            id: s.id, name: s.name, specialties: s.specialties || [],
            appointments: 0, revenue: 0, completed: 0, cancelled: 0, noShows: 0,
            commissionRate: s.commission_rate || 0, clients: new Set()
          }
        }

        for (const a of apts) {
          if (!a.staff_id || !perfMap[a.staff_id]) continue
          const p = perfMap[a.staff_id]
          p.appointments++
          if (a.status === 'completed') { p.completed++; p.revenue += a.total_price || 0 }
          if (a.status === 'cancelled') p.cancelled++
          if (a.status === 'no_show') p.noShows++
          if (a.client_id) p.clients.add(a.client_id)
        }

        const staffPerformance = Object.values(perfMap).map(p => ({
          ...p,
          uniqueClients: p.clients.size,
          avgTicket: p.completed > 0 ? Math.round(p.revenue / p.completed) : 0,
          completionRate: p.appointments > 0 ? Math.round((p.completed / p.appointments) * 100) : 0,
          commissionEarned: Math.round(p.revenue * (p.commissionRate / 100)),
          clients: undefined
        })).sort((a, b) => b.revenue - a.revenue)

        return NextResponse.json({ data: { staffPerformance, period: { start: monthStart, end: monthEnd } } })
      }

      case 'reports.retention': {
        const { data: clients } = await svc
          .from('clients')
          .select('id, first_name, last_name, email, phone, visit_count, last_visit, status, created_at')
          .eq('tenant_id', tenantId)

        const now = new Date()
        const clientList = clients || []
        let active = 0, atRisk = 0, lost = 0, newCount = 0

        const scored = clientList.map(c => {
          const lastVisit = c.last_visit ? new Date(c.last_visit) : null
          const daysSince = lastVisit ? Math.floor((now.getTime() - lastVisit.getTime()) / 86400000) : 999
          let risk: 'active' | 'at_risk' | 'lost' | 'new' = 'active'

          if (c.visit_count === 0 || !lastVisit) { risk = 'new'; newCount++ }
          else if (daysSince > 90) { risk = 'lost'; lost++ }
          else if (daysSince > 45) { risk = 'at_risk'; atRisk++ }
          else { active++ }

          return { ...c, daysSinceLastVisit: daysSince, retentionRisk: risk }
        })

        const total = clientList.length || 1
        return NextResponse.json({
          data: {
            summary: { total: clientList.length, active, atRisk, lost, new: newCount, retentionRate: Math.round((active / total) * 100) },
            clients: scored.sort((a, b) => a.daysSinceLastVisit - b.daysSinceLastVisit)
          }
        })
      }

      case 'reports.forecast': {
        const now = new Date()
        // Next 4 weeks of booked appointments
        const forecastEnd = new Date(now.getTime() + 28 * 86400000).toISOString()
        const { data: upcoming } = await svc
          .from('appointments')
          .select('start_time, total_price, status')
          .eq('tenant_id', tenantId)
          .gte('start_time', now.toISOString())
          .lte('start_time', forecastEnd)
          .in('status', ['pending', 'confirmed'])

        // Past 6 months for historical trend
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString()
        const { data: historical } = await svc
          .from('appointments')
          .select('start_time, total_price, status')
          .eq('tenant_id', tenantId)
          .gte('start_time', sixMonthsAgo)
          .lte('start_time', now.toISOString())
          .eq('status', 'completed')

        // Weekly forecast from booked
        const weeks: { label: string; booked: number; projected: number }[] = []
        for (let w = 0; w < 4; w++) {
          const wStart = new Date(now.getTime() + w * 7 * 86400000)
          const wEnd = new Date(wStart.getTime() + 7 * 86400000)
          const weekApts = (upcoming || []).filter(a => {
            const d = new Date(a.start_time)
            return d >= wStart && d < wEnd
          })
          const booked = weekApts.reduce((s, a) => s + (a.total_price || 0), 0)
          weeks.push({
            label: `Week ${w + 1}`,
            booked,
            projected: Math.round(booked * 1.15) // 15% walk-in/add-on buffer
          })
        }

        // Monthly historical trend
        const monthlyTrend: { month: string; revenue: number }[] = []
        for (let m = 5; m >= 0; m--) {
          const mDate = new Date(now.getFullYear(), now.getMonth() - m, 1)
          const mEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59)
          const mLabel = mDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          const mRevenue = (historical || [])
            .filter(a => { const d = new Date(a.start_time); return d >= mDate && d <= mEnd })
            .reduce((s, a) => s + (a.total_price || 0), 0)
          monthlyTrend.push({ month: mLabel, revenue: mRevenue })
        }

        const totalBooked = weeks.reduce((s, w) => s + w.booked, 0)
        return NextResponse.json({
          data: {
            weeks,
            monthlyTrend,
            projectedMonthRevenue: totalBooked,
            bestCase: Math.round(totalBooked * 1.3),
            conservative: Math.round(totalBooked * 0.85),
          }
        })
      }

      case 'reports.peak-hours': {
        const threeMonthsAgo = new Date()
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
        const { data: apts } = await svc
          .from('appointments')
          .select('start_time')
          .eq('tenant_id', tenantId)
          .gte('start_time', threeMonthsAgo.toISOString())
          .in('status', ['completed', 'confirmed', 'pending'])

        // Build 7x13 grid (Mon-Sun × 8am-8pm)
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        const hours = Array.from({ length: 13 }, (_, i) => i + 8) // 8-20
        const grid: Record<string, Record<number, number>> = {}
        for (const d of days) { grid[d] = {}; for (const h of hours) grid[d][h] = 0 }

        for (const a of (apts || [])) {
          const d = new Date(a.start_time)
          const dayName = days[(d.getDay() + 6) % 7] // JS Sunday=0, shift to Monday=0
          const hour = d.getHours()
          if (hour >= 8 && hour <= 20 && grid[dayName]) {
            grid[dayName][hour] = (grid[dayName][hour] || 0) + 1
          }
        }

        // Find max for color scaling
        let maxCount = 1
        for (const d of days) for (const h of hours) if (grid[d][h] > maxCount) maxCount = grid[d][h]

        return NextResponse.json({ data: { grid, days, hours, maxCount } })
      }

      // ─── CHARGES & CHECKOUT ───
      case 'charges.list': {
        const { data, error } = await svc
          .from('appointment_charges')
          .select('*, service:services(*)')
          .eq('appointment_id', payload.appointment_id)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
        return NextResponse.json({ data, error: error?.message })
      }

      case 'charges.add': {
        const { data, error } = await svc
          .from('appointment_charges')
          .insert({ ...payload, tenant_id: tenantId })
          .select('*, service:services(*)')
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'charges.delete': {
        const { error } = await svc
          .from('appointment_charges')
          .delete()
          .eq('id', payload.id)
          .eq('tenant_id', tenantId)
        return NextResponse.json({ success: !error, error: error?.message })
      }

      case 'appointments.checkout': {
        // Mark appointment as completed with payment info
        const { id, payment_method, tip_amount, total_price } = payload
        const { data, error } = await svc
          .from('appointments')
          .update({
            status: 'completed',
            payment_method,
            tip_amount: tip_amount || 0,
            total_price,
            checked_out_at: new Date().toISOString(),
            checked_out_by: staffId,
          })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select('*, client:clients(*), staff_member:staff!staff_id(*), service:services(*)')
          .single()
        return NextResponse.json({ data, error: error?.message })
      }

      case 'reports.daily-tally': {
        // Only owners/managers can see full tally
        const targetDate = payload?.date || new Date().toISOString().split('T')[0]
        const dayStart = `${targetDate}T00:00:00`
        const dayEnd = `${targetDate}T23:59:59`

        // Get all completed/checked-out appointments for the day
        const { data: apts } = await svc
          .from('appointments')
          .select('*, client:clients(*), staff_member:staff!staff_id(*), service:services(*)')
          .eq('tenant_id', tenantId)
          .gte('start_time', dayStart)
          .lte('start_time', dayEnd)
          .eq('status', 'completed')
          .order('start_time', { ascending: true })

        // Get all charges for these appointments
        const aptIds = (apts || []).map(a => a.id)
        let charges: Record<string, unknown>[] = []
        if (aptIds.length > 0) {
          const { data: ch } = await svc
            .from('appointment_charges')
            .select('*, service:services(*)')
            .eq('tenant_id', tenantId)
            .in('appointment_id', aptIds)
          charges = ch || []
        }

        // Get all staff for the tenant
        const { data: allStaff } = await svc
          .from('staff')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)

        // Aggregate by staff
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const staffMap: Record<string, any> = {}
        for (const s of (allStaff || [])) {
          staffMap[s.id] = {
            id: s.id, name: s.name, role: s.role,
            commission_rate: s.commission_rate || 0,
            services_total: 0, tips_total: 0, upsell_total: 0,
            cash_total: 0, card_total: 0,
            appointments: 0, commission_earned: 0,
            details: [],  // per-appointment detail rows
          }
        }

        // Build a map of charges grouped by appointment_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chargesByApt: Record<string, any[]> = {}
        for (const ch of charges) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chAny = ch as any
          if (!chargesByApt[chAny.appointment_id]) chargesByApt[chAny.appointment_id] = []
          chargesByApt[chAny.appointment_id].push(chAny)
        }

        // Process appointments — include base service price
        for (const apt of (apts || [])) {
          const sid = apt.staff_id || 'unassigned'
          if (!staffMap[sid]) {
            staffMap[sid] = {
              id: sid, name: 'Unassigned', role: 'technician',
              commission_rate: 0,
              services_total: 0, tips_total: 0, upsell_total: 0,
              cash_total: 0, card_total: 0,
              appointments: 0, commission_earned: 0,
              details: [],
            }
          }
          const entry = staffMap[sid]
          entry.appointments++
          entry.tips_total += Number(apt.tip_amount || 0)

          // Add base service price to services_total
          const servicePrice = Number(apt.service?.price || apt.total_price || 0)
          entry.services_total += servicePrice

          // Commission on base service: use per-service rate if set, else staff default
          const baseServiceRate = apt.service?.commission_rate
          const baseEffectiveRate = baseServiceRate != null ? baseServiceRate : entry.commission_rate
          entry.commission_earned += servicePrice * (baseEffectiveRate / 100)

          // Build add-ons list for this appointment from charges
          const aptCharges = chargesByApt[apt.id] || []
          const addOns = aptCharges
            .filter((c: any) => c.is_upsell)
            .map((c: any) => ({
              name: c.service?.name || c.description || 'Add-on',
              amount: Number(c.amount || 0),
            }))

          // Client name
          const clientName = apt.client
            ? `${apt.client.first_name}${apt.client.last_name ? ' ' + apt.client.last_name : ''}`
            : (apt.notes || 'Walk-in')

          // Add detail row
          entry.details.push({
            appointment_id: apt.id,
            client_name: clientName,
            service_name: apt.service?.name || 'Service',
            service_price: servicePrice,
            add_ons: addOns,
            tip: Number(apt.tip_amount || 0),
            payment_method: apt.payment_method || '',
            time: apt.start_time,
          })

          // Determine payment method split (full appointment total incl. tip)
          const aptTotal = Number(apt.total_price || 0)
          if (apt.payment_method === 'cash') entry.cash_total += aptTotal + Number(apt.tip_amount || 0)
          else if (apt.payment_method === 'card') entry.card_total += aptTotal + Number(apt.tip_amount || 0)
          else if (apt.payment_method === 'mixed') {
            entry.cash_total += aptTotal / 2
            entry.card_total += aptTotal / 2 + Number(apt.tip_amount || 0)
          }
        }

        // Process charges — only add upsell charges (base service already counted above)
        for (const ch of charges) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chAny = ch as any
          const sid = chAny.staff_id || 'unassigned'
          if (!staffMap[sid]) continue
          const entry = staffMap[sid]
          const amount = Number(chAny.amount || 0)

          if (chAny.is_upsell) {
            entry.upsell_total += amount
            entry.services_total += amount

            // Per-service commission rate on upsell
            const serviceRate = chAny.service?.commission_rate
            const effectiveRate = serviceRate != null ? serviceRate : entry.commission_rate
            entry.commission_earned += amount * (effectiveRate / 100)
          }
        }

        // Tips go 100% to staff
        for (const sid of Object.keys(staffMap)) {
          staffMap[sid].commission_earned += staffMap[sid].tips_total
        }

        const staffTally = Object.values(staffMap).filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: any) => s.appointments > 0 || s.services_total > 0
        )

        // Grand totals
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const totals = staffTally.reduce((acc: any, s: any) => ({
          services: acc.services + s.services_total,
          tips: acc.tips + s.tips_total,
          upsells: acc.upsells + s.upsell_total,
          cash: acc.cash + s.cash_total,
          card: acc.card + s.card_total,
          commission: acc.commission + s.commission_earned,
          appointments: acc.appointments + s.appointments,
        }), { services: 0, tips: 0, upsells: 0, cash: 0, card: 0, commission: 0, appointments: 0 })

        return NextResponse.json({
          data: {
            date: targetDate,
            staff: staffTally,
            totals,
            // Also include the role so frontend can filter
            currentStaffId: staffId,
            currentStaffRole: staffRole,
          }
        })
      }

      // ── Walk-in: create instant appointment + optional client ──
      case 'appointments.walk-in': {
        const { staff_id, service_id, client_name, client_phone, client_birthday } = payload

        if (!staff_id || !service_id) {
          return NextResponse.json({ error: 'staff_id and service_id required' }, { status: 400 })
        }

        // Get service details for duration & price
        const { data: svcData } = await svc
          .from('services')
          .select('*')
          .eq('id', service_id)
          .single()

        if (!svcData) {
          return NextResponse.json({ error: 'Service not found' }, { status: 404 })
        }

        // Optionally create or find client
        let clientId: string | null = null
        if (client_name && client_name.trim()) {
          const nameParts = client_name.trim().split(' ')
          const firstName = nameParts[0]
          const lastName = nameParts.slice(1).join(' ') || null

          // Check if client with same name+phone already exists
          if (client_phone && client_phone.trim()) {
            const { data: existing } = await svc
              .from('clients')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('phone', client_phone.trim())
              .maybeSingle()

            if (existing) {
              clientId = existing.id
              // Update birthday if provided
              if (client_birthday) {
                await svc.from('clients').update({ birthday: client_birthday }).eq('id', existing.id)
              }
            }
          }

          // Create new client if not found
          if (!clientId) {
            const { data: newClient } = await svc
              .from('clients')
              .insert({
                tenant_id: tenantId,
                first_name: firstName,
                last_name: lastName,
                phone: client_phone?.trim() || null,
                birthday: client_birthday || null,
                source: 'walk-in',
              })
              .select('id')
              .single()
            if (newClient) clientId = newClient.id
          }
        }

        // Create appointment starting now
        const now = new Date()
        const durationMs = (svcData.duration_minutes || 60) * 60 * 1000
        const endTime = new Date(now.getTime() + durationMs)

        const { data: newApt, error: aptErr } = await svc
          .from('appointments')
          .insert({
            tenant_id: tenantId,
            client_id: clientId,
            staff_id,
            service_id,
            start_time: now.toISOString(),
            end_time: endTime.toISOString(),
            total_price: svcData.price,
            status: 'confirmed',
            notes: clientId ? null : 'Walk-in',
          })
          .select('*, client:clients(*), staff_member:staff!staff_id(*), service:services(*)')
          .single()

        if (aptErr) {
          return NextResponse.json({ error: aptErr.message }, { status: 500 })
        }
        return NextResponse.json({ data: newApt })
      }

      // ─── Client Check-In ───
      case 'appointments.checkin': {
        const { appointment_id } = body

        if (!appointment_id) {
          return NextResponse.json({ error: 'Missing appointment_id' }, { status: 400 })
        }

        const { data: updatedApt, error: checkinErr } = await svc
          .from('appointments')
          .update({ checked_in_at: new Date().toISOString() })
          .eq('id', appointment_id)
          .eq('tenant_id', tenantId)
          .select('id, checked_in_at')
          .single()

        if (checkinErr) {
          return NextResponse.json({ error: checkinErr.message }, { status: 500 })
        }
        return NextResponse.json({ data: updatedApt })
      }

      // ─── Waitlist: List entries for staff view ───
      case 'waitlist.list': {
        const today = new Date().toISOString().split('T')[0]
        const { data: entries, error: wlErr } = await svc
          .from('waitlist')
          .select('id, client_id, service_id, staff_id, status, notes, created_at, client:clients(first_name, last_name), service:services(name, duration_minutes, price)')
          .eq('tenant_id', tenantId)
          .eq('status', 'waiting')
          .gte('created_at', `${today}T00:00:00`)
          .order('created_at', { ascending: true })

        if (wlErr) return NextResponse.json({ error: wlErr.message }, { status: 500 })
        return NextResponse.json({ data: entries })
      }

      // ─── Waitlist: Staff claims a walk-in client ───
      case 'waitlist.claim': {
        const { waitlist_id, staff_id: claimStaffId } = payload

        if (!waitlist_id || !claimStaffId) {
          return NextResponse.json({ error: 'Missing waitlist_id or staff_id' }, { status: 400 })
        }

        // Get the waitlist entry with client + service
        const { data: wlEntry, error: wlGetErr } = await svc
          .from('waitlist')
          .select('id, client_id, service_id, service:services(name, duration_minutes, price)')
          .eq('id', waitlist_id)
          .eq('tenant_id', tenantId)
          .eq('status', 'waiting')
          .single()

        if (wlGetErr || !wlEntry) {
          return NextResponse.json({ error: 'Waitlist entry not found or already claimed' }, { status: 404 })
        }

        // Mark waitlist entry as seated (claimed)
        await svc
          .from('waitlist')
          .update({ status: 'seated', staff_id: claimStaffId })
          .eq('id', waitlist_id)
          .eq('tenant_id', tenantId)

        // Auto-create a walk-in appointment for this client
        const now = new Date()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const svcData = wlEntry.service as any
        const durationMin = svcData?.duration_minutes || 30
        const endTime = new Date(now.getTime() + durationMin * 60000)

        const { data: newApt, error: aptCreateErr } = await svc
          .from('appointments')
          .insert({
            tenant_id: tenantId,
            client_id: wlEntry.client_id,
            staff_id: claimStaffId,
            service_id: wlEntry.service_id,
            start_time: now.toISOString(),
            end_time: endTime.toISOString(),
            status: 'confirmed',
            notes: 'Walk-in (claimed from waitlist)',
            checked_in_at: now.toISOString(),
          })
          .select('*, client:clients(*), staff_member:staff!staff_id(*), service:services(*)')
          .single()

        if (aptCreateErr) {
          return NextResponse.json({ error: aptCreateErr.message }, { status: 500 })
        }

        return NextResponse.json({ data: newApt })
      }

      /* ═══ Feedback ═══ */
      case 'feedback.create': {
        // Get staff_id from current user
        const { data: staffRow } = await svc
          .from('staff')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('user_id', user.id)
          .single()

        const { data: fb, error: fbErr } = await svc
          .from('feedback')
          .insert({
            tenant_id: tenantId,
            staff_id: staffRow?.id || null,
            page: payload.page,
            type: payload.type || 'feedback',
            message: payload.message,
            rating: payload.rating || null,
          })
          .select()
          .single()

        if (fbErr) return NextResponse.json({ error: fbErr.message }, { status: 500 })
        return NextResponse.json({ data: fb })
      }

      case 'feedback.list': {
        let query = svc
          .from('feedback')
          .select('*, staff:staff(name)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })

        if (payload?.status) query = query.eq('status', payload.status)
        if (payload?.type) query = query.eq('type', payload.type)
        if (payload?.limit) query = query.limit(payload.limit)
        else query = query.limit(50)

        const { data: fbList, error: fbListErr } = await query
        if (fbListErr) return NextResponse.json({ error: fbListErr.message }, { status: 500 })
        return NextResponse.json({ data: fbList })
      }

      case 'feedback.update': {
        const { id, ...updates } = payload
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

        if (updates.status === 'reviewed' || updates.status === 'planned' || updates.status === 'done' || updates.status === 'dismissed') {
          updates.reviewed_at = new Date().toISOString()
        }

        const { data: fbUp, error: fbUpErr } = await svc
          .from('feedback')
          .update(updates)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single()

        if (fbUpErr) return NextResponse.json({ error: fbUpErr.message }, { status: 500 })
        return NextResponse.json({ data: fbUp })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
