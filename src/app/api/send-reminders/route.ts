import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/utils'
import { appointmentReminderHtml, googleCalendarUrl } from '@/lib/email-templates'

// ─── Send Appointment Reminders (Cron-triggered) ───
// Vercel Cron calls this hourly.
// Finds pending reminders where the appointment falls within the send window,
// sends SMS via Twilio + Email via Resend, and marks them as sent.
//
// Reminder types:
//   24h — sent when appointment is 20-28 hours away
//   1h  — sent when appointment is 45-90 minutes away

export async function GET(request: Request) {
  // ── Auth: only allow Vercel Cron or manual call with CRON_SECRET ──
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

  const now = new Date()

  // ── Define time windows for each reminder type ──
  const windows: { type: string; start: Date; end: Date }[] = [
    // 24h reminders: appointment is 20-28 hours away
    { type: '24h', start: new Date(now.getTime() + 20 * 60 * 60 * 1000), end: new Date(now.getTime() + 28 * 60 * 60 * 1000) },
    // 2h reminders: appointment is 105-150 minutes away
    { type: '2h', start: new Date(now.getTime() + 105 * 60 * 1000), end: new Date(now.getTime() + 150 * 60 * 1000) },
    // 1h reminders: appointment is 45-90 minutes away
    { type: '1h', start: new Date(now.getTime() + 45 * 60 * 1000), end: new Date(now.getTime() + 90 * 60 * 1000) },
  ]

  let totalSent = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const win of windows) {
    const { data: reminders, error: fetchError } = await supabase
      .from('appointment_reminders')
      .select(`
        id, type, channel, tenant_id, appointment_id, client_id,
        appointments!inner (
          start_time, end_time, status, manage_token,
          services ( name ),
          staff!staff_id ( name )
        ),
        clients!inner (
          first_name, last_name, phone, email, sms_opt_out
        )
      `)
      .eq('status', 'pending')
      .eq('type', win.type)
      .gte('appointments.start_time', win.start.toISOString())
      .lte('appointments.start_time', win.end.toISOString())
      .limit(200)

    if (fetchError) {
      console.error(`[send-reminders] Failed to fetch ${win.type} reminders:`, fetchError)
      continue
    }

    if (!reminders || reminders.length === 0) {
      console.log(`[send-reminders] No pending ${win.type} reminders in window`)
      continue
    }

    console.log(`[send-reminders] Found ${reminders.length} pending ${win.type} reminder(s)`)

    // ── Fetch tenant info for all unique tenants ──
    const tenantIds = [...new Set(reminders.map(r => r.tenant_id))]
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, email, phone, address, settings')
      .in('id', tenantIds)

    const tenantMap = new Map(tenants?.map(t => [t.id, t]) || [])

    for (const reminder of reminders) {
      const appointment = reminder.appointments as unknown as Record<string, unknown>
      const client = reminder.clients as unknown as Record<string, unknown>
      const tenant = tenantMap.get(reminder.tenant_id)

      // Check if tenant has reminders disabled
      const settings = (tenant?.settings || {}) as Record<string, unknown>
      const reminderSettings = (settings.reminders || {}) as Record<string, boolean>
      if (reminderSettings.enabled === false) {
        await supabase.from('appointment_reminders').update({ status: 'skipped' }).eq('id', reminder.id)
        totalSkipped++
        continue
      }

      // Skip cancelled appointments
      if (appointment.status === 'cancelled') {
        await supabase.from('appointment_reminders').update({ status: 'skipped' }).eq('id', reminder.id)
        totalSkipped++
        continue
      }

      const service = appointment.services as Record<string, string> | null
      const staff = appointment.staff as Record<string, string> | null
      const startTime = new Date(appointment.start_time as string)
      const clientName = `${client.first_name || ''}${client.last_name ? ' ' + client.last_name : ''}`.trim() || 'there'
      // Greeting format: "Dear James D." instead of full name
      const clientGreeting = client.last_name
        ? `${client.first_name || 'there'} ${(client.last_name as string)[0]}.`
        : (client.first_name as string || 'there')
      const serviceName = service?.name || 'your appointment'
      const staffName = staff?.name || ''
      const businessName = tenant?.name || 'our salon'
      const businessAddress = (tenant?.address as string) || ''
      const businessPhone = (tenant?.phone as string) || ''

      // Use tenant timezone for display
      const tz = (settings.timezone as string) || 'America/Los_Angeles'
      let dateStr: string, timeStr: string
      try {
        dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
        timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
      } catch {
        dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      }

      // Build manage link
      const manageToken = (appointment.manage_token as string) || ''
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
        || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
        || 'https://glowup-jade.vercel.app'
      const manageLink = manageToken ? `${baseUrl}/manage/${manageToken}` : ''

      // Customize message based on reminder type
      const isShortNotice = win.type === '1h' || win.type === '2h'
      const urgencyLabel = win.type === '1h' ? 'in about 1 hour' : win.type === '2h' ? 'in about 2 hours' : 'tomorrow'
      const subjectPrefix = isShortNotice ? '⏰ Coming Up Soon' : '🔔 Appointment Reminder'

      const calTitle = `${serviceName} — ${businessName}`
      const calLocation = businessAddress ? `${businessName}, ${businessAddress}` : businessName
      const startISO = (appointment.start_time as string)
      const endISO = (appointment.end_time as string)
      const gcalLink = googleCalendarUrl({ title: calTitle, startISO, endISO, location: calLocation })

      const customTemplates = (settings.reminder_templates || {}) as Record<string, string>
      const smsTemplate = isShortNotice
        ? `⏰ ${clientGreeting}, your ${serviceName} appointment is ${urgencyLabel}!\n📅 ${dateStr} at ${timeStr}\n${staffName ? `💇 With: ${staffName}\n` : ''}${businessAddress ? `📍 ${businessName}, ${businessAddress}` : `📍 ${businessName}`}\n${businessPhone ? `📞 ${businessPhone}\n` : ''}📅 Add to Calendar: ${gcalLink}\n${manageLink ? `Manage: ${manageLink}` : ''}`
        : customTemplates.sms || `Dear ${clientGreeting}! This is a reminder that your ${serviceName} appointment at ${businessName} is ${urgencyLabel}, ${dateStr} at ${timeStr}.\n${staffName ? `💇 With: ${staffName}\n` : ''}${businessAddress ? `📍 ${businessAddress}` : ''}${businessPhone ? `\n📞 ${businessPhone}` : ''}\n📅 Add to Calendar: ${gcalLink}${manageLink ? `\nManage: ${manageLink}` : '\nReply C to Confirm, M to Modify, X to Cancel. Reply STOP to opt out.'}`

      const emailSubject = customTemplates.email_subject || `${subjectPrefix} — ${businessName}`

      try {
        if (reminder.channel === 'sms') {
          // Skip if client opted out or has no phone
          if (client.sms_opt_out || !client.phone) {
            await supabase.from('appointment_reminders').update({ status: 'skipped' }).eq('id', reminder.id)
            totalSkipped++
            continue
          }

          // Send SMS via Twilio REST API (no SDK — works in Edge/Serverless)
          if (hasTwilio) {
            const phoneE164 = toE164(client.phone as string)
            if (!phoneE164) {
              console.warn(`[send-reminders] ⚠️ Could not normalize phone: "${client.phone}"`)
              await supabase.from('appointment_reminders').update({ status: 'skipped' }).eq('id', reminder.id)
              totalSkipped++
              continue
            }
            const sid = process.env.TWILIO_ACCOUNT_SID!
            const token = process.env.TWILIO_AUTH_TOKEN!
            const from = process.env.TWILIO_PHONE_NUMBER!
            const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
            const auth = btoa(`${sid}:${token}`)
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ To: phoneE164, From: from, Body: smsTemplate }).toString(),
            })
            if (!res.ok) {
              const errBody = await res.text()
              throw new Error(`Twilio API error (${res.status}): ${errBody}`)
            }
            console.log(`[send-reminders] ✅ ${win.type} SMS sent to ${phoneE164}`)
          } else {
            console.log(`[DRY RUN] ${win.type} SMS to ${client.phone}: ${smsTemplate}`)
          }

          await supabase.from('appointment_reminders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', reminder.id)
          totalSent++

        } else if (reminder.channel === 'email') {
          // Skip if no email
          if (!client.email) {
            await supabase.from('appointment_reminders').update({ status: 'skipped' }).eq('id', reminder.id)
            totalSkipped++
            continue
          }

          // Send Email via Resend
          if (hasResend) {
            const { Resend } = await import('resend')
            const resend = new Resend(process.env.RESEND_API_KEY!)
            // Use HTML template (styled)
            const reminderHtml = appointmentReminderHtml({
              greeting: clientGreeting,
              serviceName,
              dateStr,
              timeStr,
              staffName,
              businessName,
              businessAddress,
              manageLink,
              startISO,
              endISO,
            })
            await resend.emails.send({
              from: `${businessName} <bookings@joinglowup.org>`,
              replyTo: tenant?.email || undefined,
              to: [client.email as string],
              subject: emailSubject,
              html: reminderHtml,
            })
            console.log(`[send-reminders] ✅ ${win.type} email sent to ${client.email}`)
          } else {
            console.log(`[DRY RUN] ${win.type} Email to ${client.email}`)
          }

          await supabase.from('appointment_reminders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', reminder.id)
          totalSent++
        }
      } catch (err) {
        console.error(`[send-reminders] Failed to send ${reminder.channel} ${win.type} reminder ${reminder.id}:`, err)
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        await supabase.from('appointment_reminders').update({ status: 'failed', error: errorMsg }).eq('id', reminder.id)
        totalFailed++
      }
    }
  }

  return NextResponse.json({
    message: `Processed reminders`,
    sent: totalSent,
    skipped: totalSkipped,
    failed: totalFailed,
  })
}
