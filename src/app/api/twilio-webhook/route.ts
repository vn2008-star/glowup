import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTwilioRequest } from '@/lib/twilio-signature'
import { phoneVariants } from '@/lib/utils'
import { handleAiChat, resolveBotConfig, type TenantRow } from '@/lib/ai-receptionist'

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Twilio Webhook: Handle SMS replies (STOP opt-out / START opt-in) ───
// Configure this URL in Twilio Console → Phone Number → Messaging → Webhook
//
// This endpoint is public by necessity and acts on whatever `From` it is given,
// so every request must be proven to have come from Twilio. Without that,
// `From=<victim>&Body=X` cancels a stranger's appointment and `Body=STOP` opts
// them out of reminders — no account needed, and phone numbers are not secret.

export async function POST(request: Request) {
  const formData = await request.formData()

  // Signature is computed over ALL the POST params, not just the ones we read.
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') params[key] = value
  }

  const unauthorized = verifyTwilioRequest(request, params)
  if (unauthorized) return unauthorized

  const body = (formData.get('Body') as string || '').trim().toUpperCase()
  const from = (formData.get('From') as string || '').trim()

  if (!from) {
    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let replyMessage = ''

  if (['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT'].includes(body)) {
    // Opt out: set sms_opt_out = true for all clients with this phone
    const { data: clients, error } = await supabase
      .from('clients')
      .update({ sms_opt_out: true })
      .in('phone', phoneVariants(from))
      .select('id')

    if (error) {
      console.error('Failed to opt out:', error)
    }

    console.log(`SMS opt-out: ${from} (${clients?.length || 0} client records updated)`)
    replyMessage = 'You have been unsubscribed from appointment reminders. Reply START to re-subscribe.'

  } else if (['START', 'SUBSCRIBE', 'YES'].includes(body)) {
    // Opt back in
    const { data: clients, error } = await supabase
      .from('clients')
      .update({ sms_opt_out: false })
      .in('phone', phoneVariants(from))
      .select('id')

    if (error) {
      console.error('Failed to opt in:', error)
    }

    console.log(`SMS opt-in: ${from} (${clients?.length || 0} client records updated)`)
    replyMessage = 'You have been re-subscribed to appointment reminders. Reply STOP at any time to opt out.'

  } else if (['C', 'CONFIRM'].includes(body)) {
    // Confirm appointment — find the most recent upcoming appointment for this phone
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
        await supabase
          .from('appointments')
          .update({ status: 'confirmed' })
          .eq('id', upcomingApt.id)
        replyMessage = '✅ Your appointment is confirmed! We look forward to seeing you.'
      } else {
        replyMessage = 'We couldn\'t find an upcoming appointment. Please contact the salon directly.'
      }
    } else {
      replyMessage = 'We couldn\'t find your account. Please contact the salon directly.'
    }

  } else if (['X'].includes(body)) {
    // Cancel appointment
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
        await supabase
          .from('appointments')
          .update({ status: 'cancelled' })
          .eq('id', upcomingApt.id)
        replyMessage = '❌ Your appointment has been cancelled. Reply or call us anytime to rebook!'
      } else {
        replyMessage = 'We couldn\'t find an upcoming appointment to cancel. Please contact the salon directly.'
      }
    } else {
      replyMessage = 'We couldn\'t find your account. Please contact the salon directly.'
    }

  } else if (['M', 'MODIFY', 'RESCHEDULE', 'CHANGE'].includes(body)) {
    // Modify — direct them to contact salon
    replyMessage = '📞 To modify your appointment, please call or text us directly and we\'ll find a new time for you!'

  } else {
    // ── Not a keyword: hand the text to the AI Receptionist ──
    // The sender's phone (verified by Twilio's signature) identifies the
    // client AND their salon, so the AI can greet them by first name.
    const rawBody = (formData.get('Body') as string || '').trim()
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
            message: rawBody,
            conversationId: conv?.id || null,
            clientPhone: from,
            channel: 'sms',
          })
          if (result.ok) replyMessage = result.response
        }
      }
    } catch (err) {
      console.error('[twilio-webhook] AI receptionist failed:', err)
    }

    if (!replyMessage) {
      replyMessage = 'Thanks for your message! Reply C to Confirm, M to Modify, X to Cancel your appointment. Reply STOP to opt out.'
    }
  }

  // Return TwiML response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${xmlEscape(replyMessage)}</Message>
</Response>`

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}
