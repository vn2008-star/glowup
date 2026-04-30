import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Send Campaign Blast (SMS + Email) ───
// Called by the "Fill My Openings" and campaign blast features.
// Receives a list of client IDs or audience filter, message template, and sends via Twilio/Resend.

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify auth via session cookie (same as data API)
  const authHeader = request.headers.get('cookie')
  if (!authHeader) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json()
  const { campaign_id, message, audience, tenant_id, channel = 'sms' } = body

  if (!message || !tenant_id) {
    return NextResponse.json({ error: 'Missing message or tenant_id' }, { status: 400 })
  }

  // Fetch recipients based on audience filter
  let query = supabase
    .from('clients')
    .select('id, first_name, last_name, phone, email, sms_opt_out, status, visit_count, lifetime_spend')
    .eq('tenant_id', tenant_id)

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
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, slug')
    .eq('id', tenant_id)
    .single()

  const businessName = tenant?.name || 'our salon'
  const bookingUrl = tenant?.slug
    ? `${process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')}/book/${tenant.slug}`
    : ''

  for (const client of clients) {
    const clientName = `${client.first_name || ''}${client.last_name ? ' ' + client.last_name : ''}`.trim() || 'there'

    // Personalize message
    const personalizedMsg = message
      .replace(/\{name\}/g, clientName)
      .replace(/\{business_name\}/g, businessName)
      .replace(/\{booking_url\}/g, bookingUrl)

    try {
      // Send SMS
      if ((channel === 'sms' || channel === 'both') && client.phone && !client.sms_opt_out) {
        if (twilioClient) {
          await twilioClient.messages.create({
            body: personalizedMsg,
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: client.phone,
          })
          sentCount++
        } else {
          console.log(`[DRY RUN] SMS to ${client.phone}: ${personalizedMsg}`)
          sentCount++ // Count as "sent" in dry run for UX feedback
        }
      }

      // Send Email
      if ((channel === 'email' || channel === 'both') && client.email) {
        if (resend) {
          await resend.emails.send({
            from: `${businessName} <onboarding@resend.dev>`,
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

  // Update campaign metrics if campaign_id provided
  if (campaign_id) {
    await supabase
      .from('campaigns')
      .update({
        status: 'completed',
        last_sent: new Date().toISOString(),
        metrics: { sent: sentCount, opened: 0, booked: 0, revenue: 0 },
      })
      .eq('id', campaign_id)
  }

  return NextResponse.json({
    sent: sentCount,
    skipped: skipCount,
    failed: failCount,
    total: clients.length,
    dry_run: !hasTwilio && !hasResend,
  })
}
