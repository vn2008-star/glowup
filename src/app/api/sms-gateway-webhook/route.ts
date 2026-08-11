import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleInboundSms } from '@/lib/inbound-sms'
import { sendSms, smsConfigFromSettings, type TenantSmsConfig } from '@/lib/sms'
import { toE164 } from '@/lib/utils'

// ─── Android SMS Gateway webhook: inbound texts to a salon's own phone ───
// The SMS Gateway for Android app (sms-gate.app) forwards received texts here
// (register the webhook in the app: Settings → Webhooks → sms:received, using
// the URL shown in GlowUp under Settings → Text Messaging).
//
// Each salon has its OWN key, so the reply goes back out through the same
// phone the text arrived on — BK Lashes' clients hear from BK Lashes' number,
// Luxe Nails' from theirs. The platform-wide SMSGATE_WEBHOOK_SECRET still
// works for a single shared gateway phone.

export async function POST(request: Request) {
  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Resolve which salon this phone belongs to. The platform secret (if set)
  // is accepted too and falls back to the env-configured gateway.
  let tenantSms: TenantSmsConfig | null = null
  let tenantName = 'platform gateway'
  if (key !== process.env.SMSGATE_WEBHOOK_SECRET) {
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, settings')
      .not('settings->sms_gateway', 'is', null)

    const match = (tenants || []).find((t) => {
      const gw = ((t.settings || {}) as Record<string, unknown>).sms_gateway as { webhook_key?: string } | undefined
      return gw?.webhook_key === key
    })
    if (!match) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    tenantSms = smsConfigFromSettings(match.settings)
    tenantName = match.name
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

  try {
    const reply = await handleInboundSms(supabase, from, text)
    if (reply) {
      await sendSms(toE164(from) || from, reply, tenantSms)
      console.log(`[sms-gateway-webhook] replied to ${from} via ${tenantName}`)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[sms-gateway-webhook] failed:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
