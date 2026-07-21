// ─── Dashboard overview payload ───
// One function, two callers: the /api/data `dashboard.overview` action (client
// refetches) and the server-rendered /dashboard page (first paint). Keeping a
// single implementation guarantees the SSR payload and the API payload never
// drift apart.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Days until the next occurrence of a birthday (0 = today), year-agnostic.
 * Feb 29 birthdays count as Mar 1 in non-leap years.
 */
export function daysUntilBirthday(birthday: string, from: Date): number | null {
  const m = birthday.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const month = Number(m[2]), day = Number(m[3])
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  let next = new Date(from.getFullYear(), month - 1, day)
  // Feb 29 in a non-leap year rolls to Mar 1 automatically via Date overflow —
  // but guard against Date normalizing e.g. Feb 30 input differently than expected.
  if (next.getMonth() !== month - 1 && !(month === 2 && day === 29)) return null
  if (next < start) next = new Date(from.getFullYear() + 1, month - 1, day)
  return Math.round((next.getTime() - start.getTime()) / 86400000)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OverviewData = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  todayAppointments: any[]
  todayRevenue: number
  pendingCount: number
  totalClients: number
  newClientsWeek: number
  retentionRate: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recentClients: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  atRiskClients: any[]
  unreadConvos: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upcomingBirthdays: any[]
}

export async function getDashboardOverview(
  svc: SupabaseClient,
  tenantId: string
): Promise<OverviewData> {
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
    birthdayClientsRes,
  ] = await Promise.all([
    svc.from('appointments')
      .select('id, client_id, staff_id, service_id, start_time, end_time, status, total_price, notes, payment_method, tip_amount, checked_in_at, client:clients(id, first_name, last_name, phone, email), service:services(id, name, price), staff_member:staff!staff_id(id, name, photo_url)')
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
      .select('id, first_name, last_name, phone, email, created_at, visit_count, lifetime_spend')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
    svc.from('clients')
      .select('id, first_name, last_name, phone, last_visit, visit_count')
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
    svc.from('clients')
      .select('id, first_name, last_name, phone, email, birthday, sms_opt_out')
      .eq('tenant_id', tenantId)
      .not('birthday', 'is', null)
      .limit(1000),
  ])

  const todayApts = todayAptsRes.data || []
  const totalClients = totalClientsRes.count || 0
  const todayRevenue = todayApts
    .filter(a => a.status === 'completed')
    .reduce((sum, a) => sum + (a.total_price || 0), 0)
  const pendingCount = todayApts.filter(a => a.status === 'pending' || a.status === 'confirmed').length
  const retentionRate = totalClients ? Math.round(((activeClientsRes.count || 0) / totalClients) * 100) : 0

  // Birthdays coming up in the next 30 days, soonest first
  const upcomingBirthdays = (birthdayClientsRes.data || [])
    .map(c => ({ ...c, days_away: daysUntilBirthday(c.birthday as string, today) }))
    .filter(c => c.days_away !== null && c.days_away <= 30)
    .sort((a, b) => (a.days_away as number) - (b.days_away as number))
    .slice(0, 8)

  return {
    todayAppointments: todayApts,
    todayRevenue,
    pendingCount,
    totalClients,
    newClientsWeek: newClientsWeekRes.count || 0,
    retentionRate,
    recentClients: recentClientsRes.data || [],
    atRiskClients: atRiskRes.data || [],
    unreadConvos: unreadConvosRes.count || 0,
    upcomingBirthdays,
  }
}
