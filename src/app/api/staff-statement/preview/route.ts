import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { fetchTenantTz } from '@/lib/notifications'
import { payPeriodInTz } from '@/lib/tz'

// ─── Preview Statement URL Generator ───
// Generates a signed statement URL for owners/managers to preview
// before sending the email to staff.

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

  const { staffId, period, offset } = body

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
    return NextResponse.json({ error: 'Only owners and managers can preview statements' }, { status: 403 })
  }

  // Same period maths as reports.staff-revenue and send-staff-reports, in
  // the salon's zone, so the preview link covers exactly what the email will.
  const pp = payPeriodInTz(period === 'monthly' ? 'monthly' : 'biweekly', Number(offset) || 0, await fetchTenantTz(svc, staffRecord.tenant_id))
  const periodStart = new Date(pp.start)
  const periodEnd = new Date(pp.end)

  const startISO = periodStart.toISOString()
  const endISO = periodEnd.toISOString()
  const token = generateStatementToken(staffId, staffRecord.tenant_id, startISO, endISO)

  const statementUrl = `/statement?staff=${staffId}&tenant=${staffRecord.tenant_id}&start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&token=${token}`

  return NextResponse.json({ data: { url: statementUrl } })
}
