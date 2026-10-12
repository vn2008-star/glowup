import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { resolveTenantTz } from '@/lib/notifications'

// ─── Subscribe-able calendar feed (.ics) ───
// A private URL per staff member (or the whole salon) that Google Calendar,
// Apple Calendar and Outlook can subscribe to, so appointments appear
// alongside everything else. Authenticated by an HMAC token over
// (tenant, staff) with the service key, same as statement links: no login
// needed (calendar apps can't log in), unguessable, and revocable only by
// rotating the key. Read-only; nothing here writes.

const WINDOW_PAST_DAYS = 30
const WINDOW_FUTURE_DAYS = 120

export function feedToken(tenantId: string, staffId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return crypto.createHmac('sha256', secret).update(`feed:${tenantId}:${staffId}`).digest('hex').slice(0, 32)
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}
/** Fold long lines at 75 octets per RFC 5545 */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = ' ' + ch } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get('tenant') || ''
  const staffId = searchParams.get('staff') || '' // 'all' = the whole salon
  const token = searchParams.get('token') || ''
  if (!tenantId || !staffId || !token) return new NextResponse('Missing parameters', { status: 400 })

  const expected = feedToken(tenantId, staffId)
  const a = Buffer.from(expected), b = Buffer.from(token)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return new NextResponse('Invalid link', { status: 403 })

  const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: tenant } = await svc.from('tenants').select('name, timezone, address, settings').eq('id', tenantId).maybeSingle()
  if (!tenant) return new NextResponse('Not found', { status: 404 })
  const tz = resolveTenantTz(tenant)

  const now = Date.now()
  let q = svc
    .from('appointments')
    .select('id, start_time, end_time, status, notes, updated_at, created_at, client:clients(first_name, last_name, phone), service:services(name), staff_member:staff!staff_id(name)')
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'confirmed', 'completed', 'blocked'])
    .gte('start_time', new Date(now - WINDOW_PAST_DAYS * 86400000).toISOString())
    .lte('start_time', new Date(now + WINDOW_FUTURE_DAYS * 86400000).toISOString())
    .order('start_time')
    .limit(1000)
  if (staffId !== 'all') q = q.eq('staff_id', staffId)
  const { data: rows } = await q

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GlowUp//Appointments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${icsEscape(tenant.name)}${staffId === 'all' ? '' : ' · ' + icsEscape(((rows?.[0]?.staff_member as unknown as { name?: string } | null)?.name) || 'Appointments')}`),
    fold(`X-WR-TIMEZONE:${tz}`),
    'X-PUBLISHED-TTL:PT15M',
  ]
  for (const r of rows || []) {
    const client = r.client as unknown as { first_name?: string; last_name?: string; phone?: string | null } | null
    const service = (r.service as unknown as { name?: string } | null)?.name
    const staff = (r.staff_member as unknown as { name?: string } | null)?.name
    const who = r.status === 'blocked' ? 'Blocked time' : client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Walk-in' : 'Walk-in'
    const summary = r.status === 'blocked' ? (r.notes || 'Blocked time') : `${who}${service ? ' · ' + service : ''}`
    const desc = [
      staff ? `With: ${staff}` : '',
      client?.phone ? `Phone: ${client.phone}` : '',
      r.status ? `Status: ${r.status}` : '',
      r.notes && r.status !== 'blocked' ? `Notes: ${r.notes}` : '',
    ].filter(Boolean).join('\n')
    lines.push(
      'BEGIN:VEVENT',
      fold(`UID:${r.id}@glowup`),
      `DTSTAMP:${icsDate(r.updated_at || r.created_at || r.start_time)}`,
      `DTSTART:${icsDate(r.start_time)}`,
      `DTEND:${icsDate(r.end_time)}`,
      fold(`SUMMARY:${icsEscape(summary)}`),
      ...(desc ? [fold(`DESCRIPTION:${icsEscape(desc)}`)] : []),
      ...(tenant.address ? [fold(`LOCATION:${icsEscape(tenant.address as string)}`)] : []),
      `STATUS:${r.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')

  return new NextResponse(lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline; filename="glowup.ics"',
    },
  })
}
