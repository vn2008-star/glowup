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
  const { data: { user } } = await supabase.auth.getUser()

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
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single()

  if (!staffRecord) {
    return NextResponse.json({ error: 'No tenant' }, { status: 404 })
  }

  const tenantId = staffRecord.tenant_id
  const staffRole = staffRecord.role

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
          .select('*, client:clients(*), staff_member:staff(*), service:services(*)')
          .eq('tenant_id', tenantId)
          .order('start_time', { ascending: true })

        if (payload?.date) {
          // Use date string directly to avoid UTC/local timezone mismatch
          const dateStr = payload.date; // e.g. "2026-04-28"
          query = query.gte('start_time', `${dateStr}T00:00:00`).lte('start_time', `${dateStr}T23:59:59`)
        }

        if (payload?.startDate && payload?.endDate) {
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
          .select('*, client:clients(*), staff_member:staff(*), service:services(*)')
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
          .select('*, client:clients(*), staff_member:staff(*), service:services(*)')
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
          .select('*, staff_member:staff(id, name), service:services(id, name, category)')
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
          .select('*, staff_member:staff(id, name), service:services(id, name, category)')
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
          .select('*, staff_member:staff(id, name), service:services(id, name, category)')
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
            .select('*, client:clients(*), service:services(*), staff_member:staff(*)')
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

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
