import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ─── Staff Revenue Report Email Sender ───
// POST: Manual send from dashboard (authenticated via session)
// GET: Automated cron send (authenticated via CRON_SECRET)
//
// Sends each staff member a personalized email with their itemized revenue
// breakdown and a link to a printable statement page.

// Simple HMAC token for statement URLs (no login required for staff to view)
function generateStatementToken(staffId: string, tenantId: string, start: string, end: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret'
  const payload = `${staffId}:${tenantId}:${start}:${end}`
  return crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32)
}

export async function POST(request: Request) {
  const [body, supabase] = await Promise.all([
    request.json(),
    createClient(),
  ])

  const { period, offset, staffIds } = body

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

  const { data: staffRecord } = await svc
    .from('staff')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single()

  if (!staffRecord || (staffRecord.role !== 'owner' && staffRecord.role !== 'manager')) {
    return NextResponse.json({ error: 'Only owners and managers can send revenue reports' }, { status: 403 })
  }

  const data = await sendReports(svc, staffRecord.tenant_id, period || 'biweekly', offset || 0, staffIds)
  return NextResponse.json({ data })
}

// Cron-triggered auto-send
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tenants } = await svc
    .from('tenants')
    .select('id, name, settings')

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ message: 'No tenants found', processed: 0 })
  }

  const results: { tenant: string; sent: number; errors: number }[] = []

  for (const tenant of tenants) {
    const settings = (tenant.settings || {}) as Record<string, unknown>
    const automations = (settings.automations || {}) as Record<string, boolean>

    if (!automations.auto_staff_reports) continue

    const day = new Date().getDate()
    const reportPeriod = (settings.staff_report_period as string) || 'biweekly'

    if (reportPeriod === 'monthly' && day !== 1) continue
    if (reportPeriod === 'biweekly' && day !== 1 && day !== 16) continue

    const result = await sendReports(svc, tenant.id, reportPeriod, -1)
    results.push({ tenant: tenant.name, ...result })
  }

  return NextResponse.json({ message: 'Staff reports processed', results })
}

// ─── Appointment detail type ───
interface AppointmentLine {
  date: string
  time: string
  clientName: string
  serviceName: string
  price: number
  tip: number
}

// ─── Core send logic ───
async function sendReports(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  tenantId: string,
  periodType: string,
  offset: number,
  staffIds?: string[]
) {
  const now = new Date()
  let periodStart: Date, periodEnd: Date, periodLabel: string

  if (periodType === 'monthly') {
    const month = now.getMonth() + offset
    periodStart = new Date(now.getFullYear(), month, 1)
    periodEnd = new Date(now.getFullYear(), month + 1, 0, 23, 59, 59)
    periodLabel = periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  } else {
    const currentDay = now.getDate()
    const isFirstHalf = currentDay <= 15
    const baseMonth = now.getMonth()
    const baseYear = now.getFullYear()

    let halfIndex = isFirstHalf ? 0 : 1
    halfIndex += offset

    const monthOffset = Math.floor(halfIndex / 2) + (halfIndex < 0 && halfIndex % 2 !== 0 ? -1 : 0)
    const half = ((halfIndex % 2) + 2) % 2

    const targetMonth = baseMonth + monthOffset
    const targetDate = new Date(baseYear, targetMonth, 1)

    if (half === 0) {
      periodStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
      periodEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), 15, 23, 59, 59)
    } else {
      periodStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 16)
      periodEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59)
    }

    const monthName = periodStart.toLocaleDateString('en-US', { month: 'short' })
    periodLabel = `${monthName} ${periodStart.getDate()}–${periodEnd.getDate()}, ${periodStart.getFullYear()}`
  }

  // Fetch data — include clients & services for itemized detail
  const [tenantRes, aptsRes, staffRes, clientsRes, servicesRes] = await Promise.all([
    svc.from('tenants').select('name, settings').eq('id', tenantId).single(),
    svc.from('appointments').select('*').eq('tenant_id', tenantId)
      .gte('start_time', periodStart.toISOString())
      .lte('start_time', periodEnd.toISOString())
      .eq('status', 'completed')
      .order('start_time', { ascending: true }),
    svc.from('staff').select('id, name, email, role, commission_rate, is_active')
      .eq('tenant_id', tenantId),
    svc.from('clients').select('id, first_name, last_name')
      .eq('tenant_id', tenantId),
    svc.from('services').select('id, name')
      .eq('tenant_id', tenantId),
  ])

  const businessName = tenantRes.data?.name || 'Your Salon'
  const apts = aptsRes.data || []
  const staffList = staffRes.data || []
  const clients = clientsRes.data || []
  const services = servicesRes.data || []

  // Build lookup maps
  const clientMap: Record<string, string> = {}
  for (const c of clients) {
    clientMap[c.id] = `${c.first_name} ${c.last_name || ''}`.trim()
  }
  const serviceMap: Record<string, string> = {}
  for (const s of services) {
    serviceMap[s.id] = s.name
  }

  // Build per-staff revenue + itemized lines
  const revMap: Record<string, {
    appointments: number; revenue: number; tips: number;
    clients: Set<string>; lines: AppointmentLine[];
  }> = {}

  for (const s of staffList) {
    revMap[s.id] = { appointments: 0, revenue: 0, tips: 0, clients: new Set(), lines: [] }
  }

  for (const a of apts) {
    if (!a.staff_id || !revMap[a.staff_id]) continue
    const r = revMap[a.staff_id]
    r.appointments++
    r.revenue += a.total_price || 0
    r.tips += a.tip_amount || 0
    if (a.client_id) r.clients.add(a.client_id)

    const aptDate = new Date(a.start_time)
    r.lines.push({
      date: aptDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: aptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      clientName: a.client_id ? (clientMap[a.client_id] || 'Walk-in') : 'Walk-in',
      serviceName: a.service_id ? (serviceMap[a.service_id] || a.service_name || 'Service') : (a.service_name || 'Service'),
      price: a.total_price || 0,
      tip: a.tip_amount || 0,
    })
  }

  // Build base URL for statement links
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  // Send emails
  const hasResend = !!process.env.RESEND_API_KEY
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resend: any = null
  if (hasResend) {
    const { Resend } = await import('resend')
    resend = new Resend(process.env.RESEND_API_KEY!)
  }

  let sent = 0, errors = 0
  const targetStaff = staffIds
    ? staffList.filter((s: { id: string }) => staffIds.includes(s.id))
    : staffList

  for (const staff of targetStaff) {
    if (!staff.email) { errors++; continue }

    const rev = revMap[staff.id] || { appointments: 0, revenue: 0, tips: 0, clients: new Set(), lines: [] }
    const commissionRate = staff.commission_rate || 0
    const commissionEarned = Math.round(rev.revenue * (commissionRate / 100))
    const avgTicket = rev.appointments > 0 ? Math.round(rev.revenue / rev.appointments) : 0

    // Generate statement URL with HMAC token
    const startISO = periodStart.toISOString()
    const endISO = periodEnd.toISOString()
    const token = generateStatementToken(staff.id, tenantId, startISO, endISO)
    const statementUrl = `${baseUrl}/statement?staff=${staff.id}&tenant=${tenantId}&start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&token=${token}`

    const html = generateReportEmail({
      staffName: staff.name,
      businessName,
      periodLabel,
      appointments: rev.appointments,
      revenue: rev.revenue,
      tips: rev.tips,
      commissionRate,
      commissionEarned,
      avgTicket,
      uniqueClients: rev.clients.size,
      lines: rev.lines,
      statementUrl,
    })

    if (resend) {
      try {
        await resend.emails.send({
          from: `${businessName} <onboarding@resend.dev>`,
          to: [staff.email],
          subject: `${businessName} — Your Revenue Report (${periodLabel})`,
          html,
        })
        sent++
      } catch (err) {
        console.error(`Email send failed for ${staff.email}:`, err)
        errors++
      }
    } else {
      console.log(`[DRY RUN] Revenue report email to ${staff.email} for ${periodLabel}`)
      console.log(`  Revenue: $${rev.revenue} | Commission: $${commissionEarned} | Appts: ${rev.appointments}`)
      console.log(`  Statement URL: ${statementUrl}`)
      sent++
    }
  }

  return { sent, errors, period: periodLabel, dry_run: !hasResend }
}

// ─── Professional HTML Email Template with Itemized Lines ───
function generateReportEmail(data: {
  staffName: string; businessName: string; periodLabel: string;
  appointments: number; revenue: number; tips: number;
  commissionRate: number; commissionEarned: number; avgTicket: number;
  uniqueClients: number; lines: AppointmentLine[]; statementUrl: string;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString()}`

  // Build itemized rows HTML
  let itemizedRows = ''
  if (data.lines.length > 0) {
    for (const line of data.lines) {
      itemizedRows += `
        <tr>
          <td style="color:#a0a0b0;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;">${line.date}</td>
          <td style="color:#a0a0b0;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;">${line.time}</td>
          <td style="color:#f0f0f5;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;">${line.clientName}</td>
          <td style="color:#f0f0f5;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;">${line.serviceName}</td>
          <td style="color:#f0f0f5;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;text-align:right;font-weight:600;">${fmt(line.price)}</td>
          <td style="color:#e8b4cb;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;text-align:right;">${line.tip > 0 ? fmt(line.tip) : '—'}</td>
        </tr>`
    }
  }

  // Show max 15 lines in email, link to full statement for more
  const maxInEmail = 15
  const hasMore = data.lines.length > maxInEmail
  let displayRows = itemizedRows
  if (hasMore) {
    const truncatedLines = data.lines.slice(0, maxInEmail)
    displayRows = ''
    for (const line of truncatedLines) {
      displayRows += `
        <tr>
          <td style="color:#a0a0b0;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;">${line.date}</td>
          <td style="color:#a0a0b0;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;">${line.time}</td>
          <td style="color:#f0f0f5;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;">${line.clientName}</td>
          <td style="color:#f0f0f5;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;">${line.serviceName}</td>
          <td style="color:#f0f0f5;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;text-align:right;font-weight:600;">${fmt(line.price)}</td>
          <td style="color:#e8b4cb;font-size:13px;padding:6px 8px;border-bottom:1px solid #2d2840;text-align:right;">${line.tip > 0 ? fmt(line.tip) : '—'}</td>
        </tr>`
    }
    displayRows += `
      <tr>
        <td colspan="6" style="color:#c9a0dc;font-size:13px;padding:10px 8px;text-align:center;font-style:italic;">
          ... and ${data.lines.length - maxInEmail} more appointments
        </td>
      </tr>`
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#1a1625;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:650px;margin:0 auto;padding:32px 20px;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#c9a0dc;font-size:28px;margin:0 0 4px;">${data.businessName}</h1>
      <p style="color:#a0a0b0;font-size:14px;margin:0;">Revenue Statement</p>
    </div>

    <!-- Period Badge -->
    <div style="text-align:center;margin-bottom:32px;">
      <span style="display:inline-block;background:linear-gradient(135deg,#c9a0dc,#e8b4cb);color:#1a1625;font-weight:700;padding:8px 24px;border-radius:24px;font-size:14px;">
        📅 ${data.periodLabel}
      </span>
    </div>

    <!-- Greeting -->
    <div style="background:#231e30;border:1px solid #3d3550;border-radius:16px;padding:24px;margin-bottom:24px;">
      <h2 style="color:#f0f0f5;font-size:18px;margin:0 0 8px;">Hi ${data.staffName} 👋</h2>
      <p style="color:#a0a0b0;font-size:14px;margin:0;line-height:1.5;">
        Here's your itemized revenue statement for <strong style="color:#e8b4cb;">${data.periodLabel}</strong>.
      </p>
    </div>

    <!-- Revenue Highlights -->
    <div style="display:flex;gap:12px;margin-bottom:24px;">
      <div style="flex:1;background:#231e30;border:1px solid #3d3550;border-radius:16px;padding:20px;text-align:center;">
        <div style="color:#c9a0dc;font-size:28px;font-weight:800;">${fmt(data.revenue)}</div>
        <div style="color:#a0a0b0;font-size:12px;margin-top:4px;">Total Revenue</div>
      </div>
      <div style="flex:1;background:#231e30;border:1px solid #3d3550;border-radius:16px;padding:20px;text-align:center;">
        <div style="color:#66d9a0;font-size:28px;font-weight:800;">${fmt(data.commissionEarned)}</div>
        <div style="color:#a0a0b0;font-size:12px;margin-top:4px;">Commission (${data.commissionRate}%)</div>
      </div>
      <div style="flex:1;background:#231e30;border:1px solid #3d3550;border-radius:16px;padding:20px;text-align:center;">
        <div style="color:#e8b4cb;font-size:28px;font-weight:800;">${fmt(data.tips)}</div>
        <div style="color:#a0a0b0;font-size:12px;margin-top:4px;">Tips</div>
      </div>
    </div>

    <!-- Itemized Appointments -->
    ${data.lines.length > 0 ? `
    <div style="background:#231e30;border:1px solid #3d3550;border-radius:16px;padding:24px;margin-bottom:24px;overflow-x:auto;">
      <h3 style="color:#f0f0f5;font-size:16px;margin:0 0 16px;border-bottom:1px solid #3d3550;padding-bottom:12px;">📋 Itemized Services</h3>
      <table style="width:100%;border-collapse:collapse;min-width:500px;">
        <thead>
          <tr>
            <th style="color:#a0a0b0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:6px 8px;border-bottom:2px solid #3d3550;text-align:left;">Date</th>
            <th style="color:#a0a0b0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:6px 8px;border-bottom:2px solid #3d3550;text-align:left;">Time</th>
            <th style="color:#a0a0b0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:6px 8px;border-bottom:2px solid #3d3550;text-align:left;">Client</th>
            <th style="color:#a0a0b0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:6px 8px;border-bottom:2px solid #3d3550;text-align:left;">Service</th>
            <th style="color:#a0a0b0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:6px 8px;border-bottom:2px solid #3d3550;text-align:right;">Price</th>
            <th style="color:#a0a0b0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:6px 8px;border-bottom:2px solid #3d3550;text-align:right;">Tip</th>
          </tr>
        </thead>
        <tbody>
          ${displayRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="color:#c9a0dc;font-size:14px;font-weight:700;padding:12px 8px 0;border-top:2px solid #3d3550;">TOTAL</td>
            <td style="color:#c9a0dc;font-size:14px;font-weight:800;text-align:right;padding:12px 8px 0;border-top:2px solid #3d3550;">${fmt(data.revenue)}</td>
            <td style="color:#e8b4cb;font-size:14px;font-weight:800;text-align:right;padding:12px 8px 0;border-top:2px solid #3d3550;">${fmt(data.tips)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    ` : `
    <div style="background:#231e30;border:1px solid #3d3550;border-radius:16px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="color:#a0a0b0;font-size:14px;margin:0;">No completed appointments in this period.</p>
    </div>
    `}

    <!-- Summary -->
    <div style="background:#231e30;border:1px solid #3d3550;border-radius:16px;padding:24px;margin-bottom:24px;">
      <h3 style="color:#f0f0f5;font-size:16px;margin:0 0 16px;border-bottom:1px solid #3d3550;padding-bottom:12px;">💰 Earnings Summary</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:#a0a0b0;font-size:14px;padding:8px 0;">Completed Appointments</td>
          <td style="color:#f0f0f5;font-size:14px;font-weight:600;text-align:right;padding:8px 0;">${data.appointments}</td>
        </tr>
        <tr>
          <td style="color:#a0a0b0;font-size:14px;padding:8px 0;">Unique Clients Served</td>
          <td style="color:#f0f0f5;font-size:14px;font-weight:600;text-align:right;padding:8px 0;">${data.uniqueClients}</td>
        </tr>
        <tr>
          <td style="color:#a0a0b0;font-size:14px;padding:8px 0;">Average Ticket</td>
          <td style="color:#f0f0f5;font-size:14px;font-weight:600;text-align:right;padding:8px 0;">${fmt(data.avgTicket)}</td>
        </tr>
        <tr>
          <td style="color:#a0a0b0;font-size:14px;padding:8px 0;">Commission (${data.commissionRate}%)</td>
          <td style="color:#66d9a0;font-size:14px;font-weight:600;text-align:right;padding:8px 0;">${fmt(data.commissionEarned)}</td>
        </tr>
        <tr>
          <td style="color:#a0a0b0;font-size:14px;padding:8px 0;">Tips</td>
          <td style="color:#e8b4cb;font-size:14px;font-weight:600;text-align:right;padding:8px 0;">${fmt(data.tips)}</td>
        </tr>
        <tr style="border-top:2px solid #3d3550;">
          <td style="color:#c9a0dc;font-size:16px;font-weight:700;padding:12px 0 0;">Total Earnings</td>
          <td style="color:#c9a0dc;font-size:18px;font-weight:800;text-align:right;padding:12px 0 0;">${fmt(data.commissionEarned + data.tips)}</td>
        </tr>
      </table>
    </div>

    <!-- View Full Statement CTA -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${data.statementUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a0dc,#e8b4cb);color:#1a1625;font-weight:700;padding:14px 36px;border-radius:12px;font-size:15px;text-decoration:none;letter-spacing:0.02em;">
        📄 View Full Statement / Print PDF
      </a>
      <p style="color:#666;font-size:12px;margin:12px 0 0;">
        Click the button above to view your full printable statement. Use your browser's Print function to save as PDF.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:24px 0;">
      <p style="color:#666;font-size:12px;margin:0;">
        Powered by <span style="color:#c9a0dc;font-weight:600;">GlowUp</span> ✨
      </p>
      <p style="color:#555;font-size:11px;margin:8px 0 0;">
        This is an automated report from ${data.businessName}. If you have questions, please contact your manager.
      </p>
    </div>
  </div>
</body>
</html>`
}
