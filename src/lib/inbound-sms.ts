// ─── Inbound SMS handling ───
// Shared by /api/twilio-webhook (texts to the Twilio number) and
// /api/sms-gateway-webhook (texts to the owner's own Android phone, forwarded
// by the SMS Gateway app). Keywords first (STOP/START/C/X/M), then the AI
// Receptionist for everything else. Returns the reply text ('' = no reply).

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneVariants } from '@/lib/utils'
import { handleAiChat, resolveBotConfig, type TenantRow } from '@/lib/ai-receptionist'

export async function handleInboundSms(
  supabase: SupabaseClient,
  from: string,
  rawBody: string,
): Promise<string> {
  const body = rawBody.trim().toUpperCase()
  let replyMessage = ''

  if (['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT'].includes(body)) {
    const { data: clients, error } = await supabase
      .from('clients')
      .update({ sms_opt_out: true })
      .in('phone', phoneVariants(from))
      .select('id')
    if (error) console.error('Failed to opt out:', error)
    console.log(`SMS opt-out: ${from} (${clients?.length || 0} client records updated)`)
    replyMessage = 'You have been unsubscribed from appointment reminders. Reply START to re-subscribe.'

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
    const { data: clients } = await supabase
      .from('clients')
      .select('id, tenant_id')
      .in('phone', phoneVariants(from))
    if (clients && clients.length > 0) {
      const clientIds = clients.map(c => c.id)
      const now = new Date().toISOString()
      const { data: upcomingApt } = await supabase
        .from('appointments')
        .select('id')
        .in('client_id', clientIds)
        .gte('start_time', now)
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (upcomingApt) {
        await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', upcomingApt.id)
        replyMessage = '✅ Your appointment is confirmed! We look forward to seeing you.'
      } else {
        replyMessage = 'We couldn\'t find an upcoming appointment. Please contact the salon directly.'
      }
    } else {
      replyMessage = 'We couldn\'t find your account. Please contact the salon directly.'
    }

  } else if (['X'].includes(body)) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, tenant_id')
      .in('phone', phoneVariants(from))
    if (clients && clients.length > 0) {
      const clientIds = clients.map(c => c.id)
      const now = new Date().toISOString()
      const { data: upcomingApt } = await supabase
        .from('appointments')
        .select('id')
        .in('client_id', clientIds)
        .gte('start_time', now)
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (upcomingApt) {
        await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', upcomingApt.id)
        replyMessage = '❌ Your appointment has been cancelled. Reply or call us anytime to rebook!'
      } else {
        replyMessage = 'We couldn\'t find an upcoming appointment to cancel. Please contact the salon directly.'
      }
    } else {
      replyMessage = 'We couldn\'t find your account. Please contact the salon directly.'
    }

  } else if (['M', 'MODIFY', 'RESCHEDULE', 'CHANGE'].includes(body)) {
    replyMessage = '📞 To modify your appointment, please call or text us directly and we\'ll find a new time for you!'

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
