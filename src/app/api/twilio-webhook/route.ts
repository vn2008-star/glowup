import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Twilio Webhook: Handle SMS replies (STOP opt-out / START opt-in) ───
// Configure this URL in Twilio Console → Phone Number → Messaging → Webhook

export async function POST(request: Request) {
  const formData = await request.formData()
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
      .eq('phone', from)
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
      .eq('phone', from)
      .select('id')

    if (error) {
      console.error('Failed to opt in:', error)
    }

    console.log(`SMS opt-in: ${from} (${clients?.length || 0} client records updated)`)
    replyMessage = 'You have been re-subscribed to appointment reminders. Reply STOP at any time to opt out.'

  } else {
    replyMessage = 'Thanks for your message! Please contact our salon directly for appointment changes.'
  }

  // Return TwiML response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${replyMessage}</Message>
</Response>`

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}
