import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleInboundSms } from '@/lib/inbound-sms'
import { sendSms } from '@/lib/sms'
import { toE164 } from '@/lib/utils'

// ─── Android SMS Gateway webhook: inbound texts to the owner's own phone ───
// The SMS Gateway for Android app (sms-gate.app) forwards received texts here
// (register the webhook in the app: Settings → Webhooks → sms:received, URL
// including ?key=<SMSGATE_WEBHOOK_SECRET>). Replies go back out through the
// same phone via the gateway's send API.
//
// Auth: shared secret in the query string — the app must be configured with
// the exact URL, so a request without the secret is not from the gateway.

export async function POST(request: Request) {
  const secret = process.env.SMSGATE_WEBHOOK_SECRET
  const url = new URL(request.url)
  if (!secret || url.searchParams.get('key') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad payload' }, { status: 400 })

  // sms-gate payload: { event: "sms:received", payload: { message, phoneNumber, receivedAt } }
  const event = body.event as string | undefined
  if (event && event !== 'sms:received') {
    return NextResponse.json({ ok: true, ignored: event })
  }
  const from = (body.payload?.phoneNumber || body.phoneNumber || '').trim()
  const text = (body.payload?.message || body.message || '').trim()
  if (!from || !text) return NextResponse.json({ error: 'Missing phoneNumber/message' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const reply = await handleInboundSms(supabase, from, text)
    if (reply) {
      await sendSms(toE164(from) || from, reply)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[sms-gateway-webhook] failed:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
