import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImpersonationOverride, isAdminEmail } from '@/lib/admin'
import { toE164 } from '@/lib/utils'

// ─── Send Campaign Blast (SMS + Email) ───
// Called by the "Fill My Openings" and campaign blast features.
// Receives an audience filter and a message template, and sends via Twilio/Resend.
//
// This endpoint spends real money and messages real people, so it authenticates
// the same way /api/data does: verify the JWT, then derive the tenant from the
// caller's own staff record. tenant_id is never read from the request body — if
// it were, any caller could blast another salon's entire client list.

export async function POST(request: Request) {
  // Parse body and authenticate in parallel
  const [body, supabase] = await Promise.all([
    request.json(),
    createClient(),
  ])

  // Verify the JWT locally (signature-checked against the cached signing key)
  // rather than round-tripping to the Auth server. See src/lib/supabase/middleware.ts.
  let claims: { sub?: string; email?: string } | null = null
  try {
    const { data } = await supabase.auth.getClaims()
    claims = data?.claims ?? null
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 })
  }

  if (!claims?.sub) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const userId = claims.sub
  const userEmail = claims.email || ''

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: staffRecord } = await svc
    .from('staff')
    .select('tenant_id')
    .eq('user_id', userId)
    .single()

  // ─── Admin impersonation override (skip DB query for non-admins) ───
  const overrideTenantId = isAdminEmail(userEmail)
    ? await getImpersonationOverride(userId, userEmail)
    : null
  const tenantId = overrideTenantId || staffRecord?.tenant_id

  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant' }, { status: 404 })
  }

  const { campaign_id, message, audience, channel = 'sms' } = body

  if (!message) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }

  // Fetch recipients based on audience filter
  let query = svc
    .from('clients')
    .select('id, first_name, last_name, phone, email, sms_opt_out, status, visit_count, lifetime_spend')
    .eq('tenant_id', tenantId)

  switch (audience) {
    case 'active':
      query = query.eq('status', 'active')
      break
    case 'at_risk':
      query = query.eq('status', 'at_risk')
      break
    case 'vip':
      query = query.or('visit_count.gte.10,lifetime_spend.gte.500')
      break
    // 'all' = no filter
  }

  const { data: clients, error: clientError } = await query

  if (clientError) {
    return NextResponse.json({ error: clientError.message }, { status: 500 })
  }

  if (!clients || clients.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: 0, message: 'No clients match the audience filter' })
  }

  let sentCount = 0
  let skipCount = 0
  let failCount = 0

  const hasTwilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER
  const hasResend = !!process.env.RESEND_API_KEY

  // Lazy-load SDKs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let twilioClient: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resend: any = null

  if (hasTwilio && (channel === 'sms' || channel === 'both')) {
    const twilio = await import('twilio')
    twilioClient = twilio.default(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  }

  if (hasResend && (channel === 'email' || channel === 'both')) {
    const { Resend } = await import('resend')
    resend = new Resend(process.env.RESEND_API_KEY!)
  }

  // Fetch tenant name for templates
  const { data: tenant } = await svc
    .from('tenants')
    .select('name, email, slug')
    .eq('id', tenantId)
    .single()

  const businessName = tenant?.name || 'our salon'
  const bookingUrl = tenant?.slug
    ? `${process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')}/book/${tenant.slug}`
    : ''

  for (const client of clients) {
    const clientName = `${client.first_name || ''}${client.last_name ? ' ' + client.last_name : ''}`.trim() || 'there'
    // Greeting format: "Dear James D." instead of full name
    const clientGreeting = client.last_name
      ? `${client.first_name || 'there'} ${client.last_name[0]}.`
      : (client.first_name || 'there')

    // Personalize message
    const personalizedMsg = message
      .replace(/\{name\}/g, clientName)
      .replace(/\{greeting\}/g, clientGreeting)
      .replace(/\{business_name\}/g, businessName)
      .replace(/\{booking_url\}/g, bookingUrl)

    try {
      // Send SMS
      if ((channel === 'sms' || channel === 'both') && client.phone && !client.sms_opt_out) {
        const phoneE164 = toE164(client.phone)
        if (twilioClient && phoneE164) {
          await twilioClient.messages.create({
            body: personalizedMsg,
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: phoneE164,
          })
          sentCount++
        } else if (!phoneE164) {
          console.warn(`[send-campaign] ⚠️ Could not normalize phone: "${client.phone}"`)
          skipCount++
        } else {
          console.log(`[DRY RUN] SMS to ${client.phone}: ${personalizedMsg}`)
          sentCount++
        }
      }

      // Send Email
      if ((channel === 'email' || channel === 'both') && client.email) {
        if (resend) {
          await resend.emails.send({
            from: `${businessName} <bookings@joinglowup.org>`,
            replyTo: tenant?.email || undefined,
            to: [client.email],
            subject: `${businessName} — Special for You! ✨`,
            text: personalizedMsg,
          })
          if (channel === 'email') sentCount++
        } else {
          console.log(`[DRY RUN] Email to ${client.email}: ${personalizedMsg}`)
          if (channel === 'email') sentCount++
        }
      }

      // Skip if no contact method available
      if (!client.phone && !client.email) {
        skipCount++
      }
    } catch (err) {
      console.error(`Failed to send to client ${client.id}:`, err)
      failCount++
    }
  }

  // Update campaign metrics if campaign_id provided. Scoped to the caller's
  // tenant so a foreign campaign_id can't be written through this endpoint.
  if (campaign_id) {
    await svc
      .from('campaigns')
      .update({
        status: 'completed',
        last_sent: new Date().toISOString(),
        metrics: { sent: sentCount, opened: 0, booked: 0, revenue: 0 },
      })
      .eq('id', campaign_id)
      .eq('tenant_id', tenantId)
  }

  return NextResponse.json({
    sent: sentCount,
    skipped: skipCount,
    failed: failCount,
    total: clients.length,
    dry_run: !hasTwilio && !hasResend,
  })
}
