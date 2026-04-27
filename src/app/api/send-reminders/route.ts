import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Send Appointment Reminders (Cron-triggered) ───
// Vercel Cron calls this once per day.
// Finds pending 24h reminders where the appointment is 20-28 hours away,
// sends SMS via Twilio + Email via Resend, and marks them as sent.

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

  // ── Find pending 24h reminders where appointment is 20-28 hours away ──
  // We use a wide window (20-28h) because cron only runs once/day,
  // so we catch appointments for the next day.
  const now = new Date()
  const windowStart = new Date(now.getTime() + 20 * 60 * 60 * 1000) // +20h
  const windowEnd = new Date(now.getTime() + 28 * 60 * 60 * 1000)   // +28h

  const { data: reminders, error: fetchError } = await supabase
    .from('appointment_reminders')
    .select(`
      id, type, channel, tenant_id, appointment_id, client_id,
      appointments!inner (
        start_time, end_time, status,
        services ( name ),
        staff ( name )
      ),
      clients!inner (
        first_name, last_name, phone, email, sms_opt_out
      )
    `)
    .eq('status', 'pending')
    .eq('type', '24h')
    .gte('appointments.start_time', windowStart.toISOString())
    .lte('appointments.start_time', windowEnd.toISOString())
    .limit(200)

  if (fetchError) {
    console.error('Failed to fetch reminders:', fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!reminders || reminders.length === 0) {
    return NextResponse.json({ message: 'No pending reminders', sent: 0 })
  }

  // ── Fetch tenant names for all unique tenants ──
  const tenantIds = [...new Set(reminders.map(r => r.tenant_id))]
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, settings')
    .in('id', tenantIds)

  const tenantMap = new Map(tenants?.map(t => [t.id, t]) || [])

  let sentCount = 0
  let skipCount = 0
  let failCount = 0

  for (const reminder of reminders) {
    const appointment = reminder.appointments as unknown as Record<string, unknown>
    const client = reminder.clients as unknown as Record<string, unknown>
    const tenant = tenantMap.get(reminder.tenant_id)

    // Check if tenant has reminders disabled
    const settings = (tenant?.settings || {}) as Record<string, unknown>
    const reminderSettings = (settings.reminders || {}) as Record<string, boolean>
    if (reminderSettings.enabled === false) {
      await supabase.from('appointment_reminders').update({ status: 'skipped' }).eq('id', reminder.id)
      skipCount++
      continue
    }

    const service = appointment.services as Record<string, string> | null
    const staff = appointment.staff as Record<string, string> | null
    const startTime = new Date(appointment.start_time as string)
    const clientName = `${client.first_name || ''}${client.last_name ? ' ' + client.last_name : ''}`.trim() || 'there'
    const serviceName = service?.name || 'your appointment'
    const staffName = staff?.name || ''
    const businessName = tenant?.name || 'our salon'
    const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    // Build message from template or default
    const customTemplates = (settings.reminder_templates || {}) as Record<string, string>
    const smsTemplate = customTemplates.sms || `Hi {client_name}! This is a reminder that your {service} appointment at {business_name} is tomorrow, {date} at {time}. Reply STOP to opt out.`
    const emailSubject = customTemplates.email_subject || `Appointment Reminder — {business_name}`
    const emailBody = customTemplates.email || `Hi {client_name},\n\nThis is a friendly reminder about your upcoming appointment:\n\n📋 Service: {service}\n📅 Date: {date}\n🕐 Time: {time}\n${staffName ? `💇 With: {staff}\n` : ''}\n📍 At: {business_name}\n\nNeed to reschedule? Please contact us as soon as possible.\n\nSee you soon!\n— {business_name}`

    function fillTemplate(template: string): string {
      return template
        .replace(/\{client_name\}/g, clientName)
        .replace(/\{service\}/g, serviceName)
        .replace(/\{staff\}/g, staffName)
        .replace(/\{business_name\}/g, businessName)
        .replace(/\{date\}/g, dateStr)
        .replace(/\{time\}/g, timeStr)
    }

    try {
      if (reminder.channel === 'sms') {
        // Skip if client opted out or has no phone
        if (client.sms_opt_out || !client.phone) {
          await supabase.from('appointment_reminders').update({ status: 'skipped' }).eq('id', reminder.id)
          skipCount++
          continue
        }

        // Send SMS via Twilio
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
          const twilio = await import('twilio')
          const twilioClient = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
          await twilioClient.messages.create({
            body: fillTemplate(smsTemplate),
            from: process.env.TWILIO_PHONE_NUMBER,
            to: client.phone as string,
          })
        } else {
          console.log(`[DRY RUN] SMS to ${client.phone}: ${fillTemplate(smsTemplate)}`)
        }

        await supabase.from('appointment_reminders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', reminder.id)
        sentCount++

      } else if (reminder.channel === 'email') {
        // Skip if no email
        if (!client.email) {
          await supabase.from('appointment_reminders').update({ status: 'skipped' }).eq('id', reminder.id)
          skipCount++
          continue
        }

        // Send Email via Resend
        if (process.env.RESEND_API_KEY) {
          const { Resend } = await import('resend')
          const resend = new Resend(process.env.RESEND_API_KEY)
          await resend.emails.send({
            from: 'GlowUp <onboarding@resend.dev>',
            to: [client.email as string],
            subject: fillTemplate(emailSubject),
            text: fillTemplate(emailBody),
          })
        } else {
          console.log(`[DRY RUN] Email to ${client.email}: ${fillTemplate(emailSubject)}`)
        }

        await supabase.from('appointment_reminders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', reminder.id)
        sentCount++
      }
    } catch (err) {
      console.error(`Failed to send ${reminder.channel} reminder ${reminder.id}:`, err)
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      await supabase.from('appointment_reminders').update({ status: 'failed', error: errorMsg }).eq('id', reminder.id)
      failCount++
    }
  }

  return NextResponse.json({
    message: `Processed ${reminders.length} reminders`,
    sent: sentCount,
    skipped: skipCount,
    failed: failCount,
  })
}
