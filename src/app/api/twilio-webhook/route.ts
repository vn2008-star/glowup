import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTwilioRequest } from '@/lib/twilio-signature'
import { handleInboundSms } from '@/lib/inbound-sms'

// ─── Twilio Webhook: inbound SMS to the Twilio number ───
// Configure this URL in Twilio Console → Phone Number → Messaging → Webhook
//
// This endpoint is public by necessity and acts on whatever `From` it is given,
// so every request must be proven to have come from Twilio. Without that,
// `From=<victim>&Body=X` cancels a stranger's appointment and `Body=STOP` opts
// them out of reminders — no account needed, and phone numbers are not secret.
//
// Keyword + AI handling lives in src/lib/inbound-sms.ts, shared with the
// Android SMS-gateway webhook.

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(request: Request) {
  const formData = await request.formData()

  // Signature is computed over ALL the POST params, not just the ones we read.
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') params[key] = value
  }

  const unauthorized = verifyTwilioRequest(request, params)
  if (unauthorized) return unauthorized

  const rawBody = (formData.get('Body') as string || '').trim()
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

  const replyMessage = await handleInboundSms(supabase, from, rawBody)

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${xmlEscape(replyMessage)}</Message>
</Response>`

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}
