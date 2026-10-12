// ─── "Tell me if a spot opens up" ───
// Clients who found a day full can leave their number on the booking page
// (public-waitlist with a preferred_date). When a cancellation frees that
// day, everyone waiting for it hears about it once and the row flips to
// 'notified'. The waitlist table already had preferred_date/time columns;
// nothing new in the schema.

import type { SupabaseClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/utils'
import { sendSms, getTenantSmsConfig } from '@/lib/sms'
import { siteBaseUrl } from '@/lib/site-url'
import { formatDateOnly } from '@/lib/format'

const MAX_NOTIFY = 10

export async function notifyWaitlistForOpening(
  svc: SupabaseClient,
  tenantId: string,
  opts: { dateStr: string; staffId: string | null; tenantName: string; slug: string | null }
): Promise<number> {
  // Anyone waiting for this day who asked for this staff member or "any"
  let q = svc
    .from('waitlist')
    .select('id, client_id, staff_id, client:clients(first_name, phone, email, sms_opt_out)')
    .eq('tenant_id', tenantId)
    .eq('status', 'waiting')
    .eq('preferred_date', opts.dateStr)
    .order('created_at', { ascending: true })
    .limit(MAX_NOTIFY)
  if (opts.staffId) q = q.or(`staff_id.is.null,staff_id.eq.${opts.staffId}`)
  const { data: rows } = await q
  if (!rows || rows.length === 0) return 0

  const bookingUrl = opts.slug ? `${siteBaseUrl()}/book/${opts.slug}` : siteBaseUrl()
  const when = formatDateOnly(opts.dateStr, { weekday: 'short', month: 'short', day: 'numeric' })
  const cfg = await getTenantSmsConfig(svc, tenantId)
  const resendMod = process.env.RESEND_API_KEY ? await import('resend') : null
  const resend = resendMod ? new resendMod.Resend(process.env.RESEND_API_KEY!) : null

  let sent = 0
  for (const row of rows) {
    const client = row.client as unknown as { first_name?: string; phone?: string | null; email?: string | null; sms_opt_out?: boolean } | null
    if (!client) continue
    const first = (client.first_name || '').trim() || 'there'
    const text = `Hi ${first}! A spot just opened at ${opts.tenantName} on ${when}. Book it here: ${bookingUrl}`
    let delivered = false
    const to = client.sms_opt_out ? null : toE164(client.phone || '')
    if (to && await sendSms(to, text, cfg)) delivered = true
    if (client.email && resend) {
      try {
        await resend.emails.send({
          from: 'GlowUp <bookings@joinglowup.org>',
          to: client.email,
          subject: `A spot opened at ${opts.tenantName} on ${when}`,
          text,
        })
        delivered = true
      } catch (err) {
        console.error('[waitlist] email failed:', err)
      }
    }
    // Mark it either way: a second cancellation shouldn't re-ping someone
    // we couldn't reach the first time, and the salon sees them as handled.
    await svc.from('waitlist').update({ status: 'notified' }).eq('id', row.id).eq('tenant_id', tenantId)
    if (delivered) sent++
  }
  return sent
}
