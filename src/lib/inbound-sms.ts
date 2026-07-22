// ─── Inbound SMS handling ───
// Shared by /api/twilio-webhook (texts to the Twilio number) and
// /api/sms-gateway-webhook (texts to the owner's own Android phone, forwarded
// by the SMS Gateway app). Keywords first (STOP/START/C/X/M), then the AI
// Receptionist for everything else. Returns the reply text ('' = no reply).

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneVariants } from '@/lib/utils'
import { handleAiChat, resolveBotConfig, type TenantRow } from '@/lib/ai-receptionist'
import { resolveTenantTz, formatAptWhen, sendOwnerChangeNotice } from '@/lib/notifications'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  || 'https://glowup-jade.vercel.app'

type UpcomingApt = {
  id: string
  tenant_id: string
  start_time: string
  manage_token: string | null
  clientName: string
  serviceName: string
  staffName: string
  tenant: { name: string; email: string | null; phone: string | null; address: string | null; timezone: string | null; settings: Record<string, unknown> | null } | null
}

/**
 * Every upcoming (pending/confirmed) appointment for the sender's phone,
 * earliest first. Neither SMS webhook knows which salon the text was meant
 * for — a phone can be a client at several GlowUp salons — so callers must
 * NEVER act on an appointment without telling the sender exactly which one,
 * and must not guess at all when the matches span multiple salons.
 */
async function findUpcomingAppointments(supabase: SupabaseClient, from: string): Promise<UpcomingApt[]> {
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .in('phone', phoneVariants(from))
  if (!clients || clients.length === 0) return []

  const nameById = new Map(clients.map(c => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()]))
  const { data: apts } = await supabase
    .from('appointments')
    .select(`
      id, tenant_id, client_id, start_time, manage_token,
      services ( name ),
      staff!staff_id ( name ),
      tenants ( name, email, phone, address, timezone, settings )
    `)
    .in('client_id', clients.map(c => c.id))
    .gte('start_time', new Date().toISOString())
    .in('status', ['pending', 'confirmed'])
    .order('start_time', { ascending: true })
    .limit(5)

  return (apts || []).map(a => ({
    id: a.id,
    tenant_id: a.tenant_id,
    start_time: a.start_time,
    manage_token: a.manage_token,
    clientName: nameById.get(a.client_id as string) || 'Client',
    serviceName: (a.services as unknown as { name?: string } | null)?.name || 'appointment',
    staffName: (a.staff as unknown as { name?: string } | null)?.name || '',
    tenant: (a.tenants as unknown as UpcomingApt['tenant']) || null,
  }))
}

function aptWhen(apt: UpcomingApt): { dateStr: string; timeStr: string } {
  return formatAptWhen(new Date(apt.start_time), resolveTenantTz(apt.tenant))
}

function manageLink(apt: UpcomingApt): string {
  return apt.manage_token ? `${BASE_URL}/manage/${apt.manage_token}` : ''
}

export async function handleInboundSms(
  supabase: SupabaseClient,
  from: string,
  rawBody: string,
): Promise<string> {
  const body = rawBody.trim().toUpperCase()
  let replyMessage = ''

  if (['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT'].includes(body)) {
    // Carrier-mandated opt-out keywords — these MUST unsubscribe. But a client
    // texting "CANCEL" almost always means "cancel my appointment", not "stop
    // texting me": tell them the appointment is still booked and how to
    // actually cancel it, or they find out at the front desk.
    const { data: clients, error } = await supabase
      .from('clients')
      .update({ sms_opt_out: true })
      .in('phone', phoneVariants(from))
      .select('id')
    if (error) console.error('Failed to opt out:', error)
    console.log(`SMS opt-out: ${from} (${clients?.length || 0} client records updated)`)
    replyMessage = 'You have been unsubscribed from appointment reminders. Reply START to re-subscribe.'

    if (body === 'CANCEL') {
      const upcoming = await findUpcomingAppointments(supabase, from)
      if (upcoming.length > 0) {
        const apt = upcoming[0]
        const { dateStr, timeStr } = aptWhen(apt)
        const link = manageLink(apt)
        replyMessage += `\n\nNote: your ${apt.serviceName} on ${dateStr} at ${timeStr} is still booked. To cancel the appointment, reply X${link ? ` or visit: ${link}` : ''}.`
      }
    }

  } else if (['START', 'SUBSCRIBE', 'YES'].includes(body)) {
    const { data: clients, error } = await supabase
      .from('clients')
      .update({ sms_opt_out: false })
      .in('phone', phoneVariants(from))
      .select('id')
    if (error) console.error('Failed to opt in:', error)
    console.log(`SMS opt-in: ${from} (${clients?.length || 0} client records updated)`)
    replyMessage = 'You have been re-subscribed to appointment reminders. Reply STOP at any time to opt out.'

  } else if (['C', 'CONFIRM'].includes(body)) {
    const upcoming = await findUpcomingAppointments(supabase, from)
    if (upcoming.length > 0) {
      const apt = upcoming[0]
      await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', apt.id)
      const { dateStr, timeStr } = aptWhen(apt)
      replyMessage = `✅ Confirmed: ${apt.serviceName} on ${dateStr} at ${timeStr}${apt.tenant?.name ? ` at ${apt.tenant.name}` : ''}. We look forward to seeing you!`
    } else {
      replyMessage = 'We couldn\'t find an upcoming appointment. Please contact the salon directly.'
    }

  } else if (['X'].includes(body)) {
    const upcoming = await findUpcomingAppointments(supabase, from)
    if (upcoming.length === 0) {
      replyMessage = 'We couldn\'t find an upcoming appointment to cancel. Please contact the salon directly.'
    } else if (new Set(upcoming.map(a => a.tenant_id)).size > 1) {
      // Appointments at more than one salon — never guess which to cancel.
      const lines = upcoming
        .filter((a, i, arr) => arr.findIndex(b => b.tenant_id === a.tenant_id) === i)
        .map(a => {
          const { dateStr, timeStr } = aptWhen(a)
          const link = manageLink(a)
          return `${a.tenant?.name || 'Salon'} — ${dateStr} at ${timeStr}${link ? `: ${link}` : ''}`
        })
      replyMessage = `You have appointments at more than one salon. To cancel, use the link for the right one:\n${lines.join('\n')}`
    } else {
      const apt = upcoming[0]
      // Guard on status so a concurrent cancel/checkout isn't clobbered
      const { error: cancelErr } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', apt.id)
        .in('status', ['pending', 'confirmed'])
      if (cancelErr) {
        console.error('[inbound-sms] cancel failed:', cancelErr)
        replyMessage = 'Sorry, we couldn\'t cancel your appointment. Please contact the salon directly.'
      } else {
        // A cancelled appointment must never remind
        await supabase
          .from('appointment_reminders')
          .update({ status: 'skipped' })
          .eq('appointment_id', apt.id)
          .eq('status', 'pending')

        try {
          await sendOwnerChangeNotice({
            type: 'cancel',
            tenant: apt.tenant,
            clientName: apt.clientName,
            serviceName: apt.serviceName,
            staffName: apt.staffName,
            start: new Date(apt.start_time),
            tz: resolveTenantTz(apt.tenant),
            via: 'by SMS reply',
          })
        } catch (err) {
          console.error('[inbound-sms] owner cancel notice failed:', err)
        }

        const { dateStr, timeStr } = aptWhen(apt)
        replyMessage = `❌ Cancelled: ${apt.serviceName} on ${dateStr} at ${timeStr}${apt.tenant?.name ? ` at ${apt.tenant.name}` : ''}. Reply or call us anytime to rebook!`
        if (upcoming.length > 1) {
          const next = upcoming[1]
          const nw = aptWhen(next)
          const link = manageLink(next)
          replyMessage += `\nYour next appointment (${nw.dateStr} at ${nw.timeStr}) is still booked${link ? ` — manage it here: ${link}` : ''}.`
        }
      }
    }

  } else if (['M', 'MODIFY', 'RESCHEDULE', 'CHANGE'].includes(body)) {
    const upcoming = await findUpcomingAppointments(supabase, from)
    const apt = upcoming[0]
    const link = apt ? manageLink(apt) : ''
    if (apt && link) {
      const { dateStr, timeStr } = aptWhen(apt)
      replyMessage = `🔄 To reschedule your ${apt.serviceName} on ${dateStr} at ${timeStr}, pick a new time here: ${link}\nOr reply with a question and we'll help!`
    } else {
      replyMessage = '📞 To modify your appointment, please call or text us directly and we\'ll find a new time for you!'
    }

  } else {
    // ── Not a keyword: hand the text to the AI Receptionist ──
    // The sender's phone identifies the client AND their salon, so the AI
    // can greet them by first name.
    try {
      const { data: client } = await supabase
        .from('clients')
        .select('id, tenant_id')
        .in('phone', phoneVariants(from))
        .limit(1)
        .maybeSingle()

      if (client) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id, name, slug, phone, email, address, timezone, settings')
          .eq('id', client.tenant_id)
          .single()

        const botConfig = tenant ? resolveBotConfig(tenant as TenantRow) : null
        if (tenant && botConfig?.enabled && botConfig.channels?.sms) {
          // Continue the client's existing SMS thread if there is one
          const { data: conv } = await supabase
            .from('conversations')
            .select('id')
            .eq('tenant_id', tenant.id)
            .eq('client_id', client.id)
            .eq('channel', 'sms')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          const result = await handleAiChat({
            svc: supabase,
            tenant: tenant as TenantRow,
            message: rawBody.trim(),
            conversationId: conv?.id || null,
            clientPhone: from,
            channel: 'sms',
          })
          if (result.ok) replyMessage = result.response
        }
      }
    } catch (err) {
      console.error('[inbound-sms] AI receptionist failed:', err)
    }

    if (!replyMessage) {
      replyMessage = 'Thanks for your message! Reply C to Confirm, M to Modify, X to Cancel your appointment. Reply STOP to opt out.'
    }
  }

  return replyMessage
}
