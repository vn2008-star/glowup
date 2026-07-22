// ─── Shared dashboard queries (clients list, calendar batch load) ───
// Each function has two callers: the /api/data action (client-side refetches)
// and the server-rendered page (first paint). One implementation, no drift.

import type { SupabaseClient } from '@supabase/supabase-js'

function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  return phone.replace(/\d(?=\d{4})/g, '•')
}

function maskEmail(email: string | null): string | null {
  if (!email) return null
  const [user, domain] = email.split('@')
  return `${user[0]}${'•'.repeat(Math.max(user.length - 1, 2))}@${domain}`
}

/** Mask contact info (client-protection mode for technicians). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function maskClientRow(client: any) {
  if (!client) return client
  return { ...client, phone: maskPhone(client.phone), email: maskEmail(client.email), _masked: true }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getClientsList(
  svc: SupabaseClient,
  tenantId: string,
  opts: { mask: boolean; limit?: number }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any[]; error?: string }> {
  const { data, error } = await svc
    .from('clients')
    .select('id, tenant_id, first_name, last_name, phone, email, birthday, notes, photo_url, loyalty_points, tags, lifetime_spend, visit_count, last_visit, status, created_at, preferences, allergies')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(opts.limit || 200)

  const rows = data || []
  return {
    data: opts.mask ? rows.map(maskClientRow) : rows,
    error: error?.message,
  }
}

export type CalendarLoadData = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  staff: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appointments: any[]
  error?: string
}

export async function getCalendarLoad(
  svc: SupabaseClient,
  tenantId: string,
  opts: { startDate?: string; endDate?: string; limit?: number }
): Promise<CalendarLoadData> {
  const [staffRes, svcRes, aptsQuery] = await Promise.all([
    svc.from('staff').select('id, tenant_id, user_id, name, role, email, phone, photo_url, specialties, schedule, commission_rate, is_active').eq('tenant_id', tenantId),
    svc.from('services').select('id, tenant_id, name, category, description, duration_minutes, price, price_addons, commission_rate, image_url, is_active, sort_order').eq('tenant_id', tenantId).order('sort_order', { ascending: true }),
    (() => {
      let q = svc
        .from('appointments')
        .select('id, tenant_id, client_id, staff_id, service_id, start_time, end_time, status, total_price, notes, payment_method, tip_amount, checked_out_at, checked_in_at, created_at, client:clients(id, first_name, last_name, phone, email, photo_url), staff_member:staff!staff_id(id, name, photo_url, role), service:services(id, name, category, duration_minutes, price, commission_rate)')
        .eq('tenant_id', tenantId)
        // Cancelled rows stay in the DB for history/reporting, but the calendar
        // must not render them or count them against open slots/utilization.
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true })
      if (opts.startDate && opts.endDate) {
        q = q.gte('start_time', opts.startDate).lte('start_time', opts.endDate)
      }
      return q.limit(opts.limit || 500)
    })(),
  ])

  // Filter staff: hide Admin records, sort by role
  const visible = (staffRes.data || []).filter((s: { name: string }) => s.name !== 'Admin')
  const rolePriority: Record<string, number> = { owner: 0, manager: 1, technician: 2 }
  const sortedStaff = visible.sort((a: { role: string; name: string }, b: { role: string; name: string }) => {
    const ra = rolePriority[a.role] ?? 3
    const rb = rolePriority[b.role] ?? 3
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })

  const activeServices = (svcRes.data || []).filter((s: { is_active: boolean }) => s.is_active)

  return {
    staff: sortedStaff,
    services: activeServices,
    appointments: aptsQuery.data || [],
    error: staffRes.error?.message || svcRes.error?.message || aptsQuery.error?.message || undefined,
  }
}
