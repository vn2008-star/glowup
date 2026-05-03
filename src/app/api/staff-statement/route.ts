import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ─── Statement Data API ───
// Returns itemized statement data for a staff member
// Secured via HMAC token (no login required — staff click link from email)

function verifyToken(staffId: string, tenantId: string, start: string, end: string, token: string): boolean {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret'
  const payload = `${staffId}:${tenantId}:${start}:${end}`
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32)
  return token === expected
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const staffId = searchParams.get('staff')
  const tenantId = searchParams.get('tenant')
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const token = searchParams.get('token')

  if (!staffId || !tenantId || !start || !end || !token) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  if (!verifyToken(staffId, tenantId, start, end, token)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [tenantRes, staffRes, aptsRes, clientsRes, servicesRes] = await Promise.all([
    svc.from('tenants').select('name').eq('id', tenantId).single(),
    svc.from('staff').select('id, name, email, role, commission_rate').eq('id', staffId).single(),
    svc.from('appointments').select('*').eq('tenant_id', tenantId).eq('staff_id', staffId)
      .gte('start_time', start).lte('start_time', end)
      .eq('status', 'completed').order('start_time', { ascending: true }),
    svc.from('clients').select('id, first_name, last_name').eq('tenant_id', tenantId),
    svc.from('services').select('id, name').eq('tenant_id', tenantId),
  ])

  const businessName = tenantRes.data?.name || 'Your Salon'
  const staff = staffRes.data
  const apts = aptsRes.data || []
  const clients = clientsRes.data || []
  const services = servicesRes.data || []

  if (!staff) {
    return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  }

  const clientMap: Record<string, string> = {}
  for (const c of clients) clientMap[c.id] = `${c.first_name} ${c.last_name || ''}`.trim()
  const serviceMap: Record<string, string> = {}
  for (const s of services) serviceMap[s.id] = s.name

  let totalRevenue = 0, totalTips = 0
  const lines = apts.map((a: Record<string, unknown>) => {
    const price = (a.total_price as number) || 0
    const tip = (a.tip_amount as number) || 0
    totalRevenue += price
    totalTips += tip
    const d = new Date(a.start_time as string)
    return {
      date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      client: a.client_id ? (clientMap[a.client_id as string] || 'Walk-in') : 'Walk-in',
      service: a.service_id ? (serviceMap[a.service_id as string] || (a.service_name as string) || 'Service') : ((a.service_name as string) || 'Service'),
      price,
      tip,
    }
  })

  const commissionRate = staff.commission_rate || 0
  const commissionEarned = Math.round(totalRevenue * (commissionRate / 100))

  // Build period label
  const startDate = new Date(start)
  const endDate = new Date(end)
  const periodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return NextResponse.json({
    data: {
      businessName,
      staffName: staff.name,
      staffRole: staff.role,
      staffEmail: staff.email,
      commissionRate,
      commissionEarned,
      periodLabel,
      lines,
      totals: {
        appointments: lines.length,
        revenue: totalRevenue,
        tips: totalTips,
        earnings: commissionEarned + totalTips,
      }
    }
  })
}
