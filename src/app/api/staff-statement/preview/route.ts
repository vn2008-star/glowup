import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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

  // Calculate period dates
  const now = new Date()
  const periodType = period || 'biweekly'
  const off = offset || 0
  let periodStart: Date, periodEnd: Date

  if (periodType === 'monthly') {
    const month = now.getMonth() + off
    periodStart = new Date(now.getFullYear(), month, 1)
    periodEnd = new Date(now.getFullYear(), month + 1, 0, 23, 59, 59)
  } else {
    const currentDay = now.getDate()
    const isFirstHalf = currentDay <= 15
    let halfIndex = (isFirstHalf ? 0 : 1) + off
    const monthOffset = Math.floor(halfIndex / 2) + (halfIndex < 0 && halfIndex % 2 !== 0 ? -1 : 0)
    const half = ((halfIndex % 2) + 2) % 2
    const targetMonth = now.getMonth() + monthOffset
    const targetDate = new Date(now.getFullYear(), targetMonth, 1)

    if (half === 0) {
      periodStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
      periodEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), 15, 23, 59, 59)
    } else {
      periodStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 16)
      periodEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59)
    }
  }

  const startISO = periodStart.toISOString()
  const endISO = periodEnd.toISOString()
  const token = generateStatementToken(staffId, staffRecord.tenant_id, startISO, endISO)

  const statementUrl = `/statement?staff=${staffId}&tenant=${staffRecord.tenant_id}&start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&token=${token}`

  return NextResponse.json({ data: { url: statementUrl } })
}
