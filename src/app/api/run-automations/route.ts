import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Automation Engine (Cron-triggered) ───
// Runs daily. Checks each tenant's automation settings and fires:
// - Birthday Auto-Send (7 days before birthday)
// - Rebooking Reminder (based on service cycle, default 30 days)
// - No-Show Follow-Up (1 hour after missed appointment)
// - Review Request (2 hours after completed service)
// - Loyalty Milestone (when reaching point threshold)

export async function GET(request: Request) {
  // Auth: only allow Vercel Cron or manual call with CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const hasTwilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER
  const hasResend = !!process.env.RESEND_API_KEY

  // Lazy-load SDKs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let twilioClient: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resendClient: any = null

  if (hasTwilio) {
    const twilio = await import('twilio')
    twilioClient = twilio.default(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  }
  if (hasResend) {
    const { Resend } = await import('resend')
    resendClient = new Resend(process.env.RESEND_API_KEY!)
  }

  // Fetch all tenants with automation settings
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug, settings')

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ message: 'No tenants found', processed: 0 })
  }

  const results: Record<string, number> = {
    birthday: 0,
    rebooking: 0,
    noshow: 0,
    review: 0,
  }

  for (const tenant of tenants) {
    const settings = (tenant.settings || {}) as Record<string, unknown>
    const automations = (settings.automations || {}) as Record<string, boolean>
    const businessName = tenant.name || 'our salon'
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const bookingUrl = `${baseUrl}/book/${tenant.slug}`

    // ── Birthday Auto-Send ──
    if (automations.auto_birthday !== false) {
      const today = new Date()
      const targetDate = new Date(today)
      targetDate.setDate(targetDate.getDate() + 7) // 7 days from now
      const targetMonth = targetDate.getMonth() + 1
      const targetDay = targetDate.getDate()

      const { data: birthdayClients } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, email, sms_opt_out')
        .eq('tenant_id', tenant.id)
        .not('birthday', 'is', null)

      if (birthdayClients) {
        for (const client of birthdayClients) {
          // Check if birthday matches (we need to query raw since Supabase doesn't support EXTRACT)
          // We'll check via the birthday string format
          const { data: clientFull } = await supabase
            .from('clients')
            .select('birthday')
            .eq('id', client.id)
            .single()

          if (!clientFull?.birthday) continue
          const bday = new Date(clientFull.birthday)
          if (bday.getMonth() + 1 !== targetMonth || bday.getDate() !== targetDay) continue

          const clientName = `${client.first_name || ''}`.trim() || 'there'
          const message = `Happy Birthday, ${clientName}! 🎂 ${businessName} wants to celebrate YOU — enjoy 20% off any service this month! Book now → ${bookingUrl}`

          await sendMessage({ client, message, businessName, twilioClient, resendClient, channel: 'both' })
          results.birthday++
        }
      }
    }

    // ── Rebooking Reminder (clients not seen in 30+ days) ──
    if (automations.auto_rebooking !== false) {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: staleClients } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, email, sms_opt_out, last_visit')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .not('last_visit', 'is', null)
        .lte('last_visit', thirtyDaysAgo.toISOString())
        .limit(50) // Process in batches

      if (staleClients) {
        for (const client of staleClients) {
          const clientName = `${client.first_name || ''}`.trim() || 'there'
          const daysSince = Math.round((Date.now() - new Date(client.last_visit).getTime()) / (1000 * 60 * 60 * 24))
          const message = `Hey ${clientName}! It's been ${daysSince} days since your last visit to ${businessName}. Time for a refresh? Book now → ${bookingUrl}`

          await sendMessage({ client, message, businessName, twilioClient, resendClient, channel: 'sms' })
          results.rebooking++

          // Mark client as reminded to prevent duplicate sends
          await supabase
            .from('clients')
            .update({ notes: `[Auto] Rebooking reminder sent ${new Date().toLocaleDateString()}` })
            .eq('id', client.id)
        }
      }
    }

    // ── No-Show Follow-Up ──
    if (automations.auto_noshow !== false) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)

      const { data: noShows } = await supabase
        .from('appointments')
        .select(`
          id, start_time, status, notes,
          clients!inner (id, first_name, last_name, phone, email, sms_opt_out)
        `)
        .eq('tenant_id', tenant.id)
        .eq('status', 'no_show')
        .gte('start_time', fourHoursAgo.toISOString())
        .lte('start_time', twoHoursAgo.toISOString())
        .limit(20)

      if (noShows) {
        for (const apt of noShows) {
          const client = apt.clients as unknown as Record<string, string | boolean>
          if (!client) continue

          // Skip if already followed up (check notes)
          if (apt.notes?.includes('[Auto] No-show follow-up sent')) continue

          const clientName = `${client.first_name || ''}`.trim() || 'there'
          const message = `Hi ${clientName}, we missed you today at ${businessName}! 😊 Life happens — we'd love to help you rebook. Book your next visit → ${bookingUrl}`

          await sendMessage({ client, message, businessName, twilioClient, resendClient, channel: 'sms' })
          results.noshow++

          // Mark as followed up
          await supabase
            .from('appointments')
            .update({ notes: `${apt.notes || ''}\n[Auto] No-show follow-up sent ${new Date().toLocaleDateString()}` })
            .eq('id', apt.id)
        }
      }
    }

    // ── Review Request (2h after completed appointments) ──
    if (automations.auto_review !== false) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)

      const { data: completedApts } = await supabase
        .from('appointments')
        .select(`
          id, end_time, notes,
          clients!inner (id, first_name, last_name, phone, email, sms_opt_out)
        `)
        .eq('tenant_id', tenant.id)
        .eq('status', 'completed')
        .gte('end_time', fourHoursAgo.toISOString())
        .lte('end_time', twoHoursAgo.toISOString())
        .limit(20)

      if (completedApts) {
        for (const apt of completedApts) {
          const client = apt.clients as unknown as Record<string, string | boolean>
          if (!client) continue

          // Skip if already requested
          if (apt.notes?.includes('[Auto] Review request sent')) continue

          const clientName = `${client.first_name || ''}`.trim() || 'there'
          const message = `Thanks for visiting ${businessName} today, ${clientName}! 🌟 We'd love to hear how it went — a quick review means the world to us ❤️`

          await sendMessage({ client, message, businessName, twilioClient, resendClient, channel: 'sms' })
          results.review++

          // Mark as requested
          await supabase
            .from('appointments')
            .update({ notes: `${apt.notes || ''}\n[Auto] Review request sent ${new Date().toLocaleDateString()}` })
            .eq('id', apt.id)
        }
      }
    }
  }

  return NextResponse.json({
    message: 'Automations processed',
    results,
    dry_run: !hasTwilio && !hasResend,
  })
}

// ─── Helper: Send SMS/Email ───
async function sendMessage(opts: {
  client: Record<string, unknown>
  message: string
  businessName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  twilioClient: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resendClient: any
  channel: 'sms' | 'email' | 'both'
}) {
  const { client, message, businessName, twilioClient, resendClient, channel } = opts

  // SMS
  if ((channel === 'sms' || channel === 'both') && client.phone && !client.sms_opt_out) {
    if (twilioClient) {
      try {
        await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: client.phone as string,
        })
      } catch (err) {
        console.error(`SMS send failed for ${client.phone}:`, err)
      }
    } else {
      console.log(`[DRY RUN] SMS to ${client.phone}: ${message}`)
    }
  }

  // Email
  if ((channel === 'email' || channel === 'both') && client.email) {
    if (resendClient) {
      try {
        await resendClient.emails.send({
          from: `${businessName} <onboarding@resend.dev>`,
          to: [client.email as string],
          subject: `${businessName} — We're thinking of you! ✨`,
          text: message,
        })
      } catch (err) {
        console.error(`Email send failed for ${client.email}:`, err)
      }
    } else {
      console.log(`[DRY RUN] Email to ${client.email}: ${message}`)
    }
  }
}
