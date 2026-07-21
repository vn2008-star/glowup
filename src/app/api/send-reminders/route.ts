import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/utils'
import { verifyCronRequest } from '@/lib/cron-auth'
import { fillPlaceholders, resolveTenantTz } from '@/lib/notifications'
import { sendSms, smsProvider } from '@/lib/sms'
import { appointmentReminderHtml, dailyDigestHtml, googleCalendarUrl } from '@/lib/email-templates'
import { localToUTC, nowInTz, formatInTz } from '@/lib/tz'

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
  const unauthorized = verifyCronRequest(request)
  if (unauthorized) return unauthorized

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const hasSms = smsProvider() !== null
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
      .select('id, name, email, phone, address, timezone, settings')
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

      // Use tenant timezone for display — from the tenants.timezone COLUMN
      // (what Settings saves), not the legacy settings blob.
      const tz = resolveTenantTz(tenant)
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

      // Values for the {tokens} an owner can use in their custom templates.
      // Both vocabularies are supplied for the same value because Settings
      // advertises {client_name}/{service}/{address} while campaigns taught
      // owners {name}/{greeting}/{booking_url}.
      const templateVars: Record<string, string> = {
        client_name: clientGreeting,
        name: clientGreeting,
        greeting: clientGreeting,
        full_name: clientName,
        service: serviceName,
        staff_name: staffName,
        business_name: businessName,
        address: businessAddress,
        phone: businessPhone,
        date: dateStr,
        time: timeStr,
        manage_url: manageLink,
        manage_link: manageLink,
        booking_url: manageLink,
        calendar_url: gcalLink,
      }

      // Only the 24h reminder honours the owner's custom SMS — the stock copy
      // says "tomorrow", so reusing it for the 1h/2h nudges would misstate the
      // time. Short-notice keeps its own wording.
      const smsTemplate = isShortNotice
        ? `⏰ ${clientGreeting}, your ${serviceName} appointment is ${urgencyLabel}!\n📅 ${dateStr} at ${timeStr}\n${staffName ? `💇 With: ${staffName}\n` : ''}${businessAddress ? `📍 ${businessName}, ${businessAddress}` : `📍 ${businessName}`}\n${businessPhone ? `📞 ${businessPhone}\n` : ''}📅 Add to Calendar: ${gcalLink}\n${manageLink ? `Manage: ${manageLink}` : ''}`
        : (customTemplates.sms
            ? fillPlaceholders(customTemplates.sms, templateVars)
            : `Dear ${clientGreeting}! This is a reminder that your ${serviceName} appointment at ${businessName} is ${urgencyLabel}, ${dateStr} at ${timeStr}.\n${staffName ? `💇 With: ${staffName}\n` : ''}${businessAddress ? `📍 ${businessAddress}` : ''}${businessPhone ? `\n📞 ${businessPhone}` : ''}\n📅 Add to Calendar: ${gcalLink}${manageLink ? `\nManage: ${manageLink}` : '\nReply C to Confirm, M to Modify, X to Cancel. Reply STOP to opt out.'}`)

      const emailSubject = customTemplates.email_subject
        ? fillPlaceholders(customTemplates.email_subject, templateVars)
        : `${subjectPrefix} — ${businessName}`

      try {
        if (reminder.channel === 'sms') {
          // Skip if client opted out or has no phone
          if (client.sms_opt_out || !client.phone) {
            await supabase.from('appointment_reminders').update({ status: 'skipped' }).eq('id', reminder.id)
            totalSkipped++
            continue
          }

          // Send SMS via the configured provider (Twilio or the owner's Android phone)
          if (hasSms) {
            const phoneE164 = toE164(client.phone as string)
            if (!phoneE164) {
              console.warn(`[send-reminders] ⚠️ Could not normalize phone: "${client.phone}"`)
              await supabase.from('appointment_reminders').update({ status: 'skipped' }).eq('id', reminder.id)
              totalSkipped++
              continue
            }
            const ok = await sendSms(phoneE164, smsTemplate)
            if (!ok) {
              throw new Error(`SMS send failed via ${smsProvider()}`)
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

  // ─── Daily schedule digest for the owner & staff ───
  // Fires once per tenant per day, when the salon's local hour matches the
  // configured send hour (default 7 AM). This is the "reminder for the
  // business" that never existed: owner gets the whole day, each staff member
  // gets their own appointments. Config lives in settings.staff_reminders
  // ({ enabled, digest_hour, owner_sms }) — saved from Settings → Reminders.
  let digestsSent = 0
  if (hasResend || hasSms) {
    const { data: allTenants } = await supabase
      .from('tenants')
      .select('id, name, email, phone, address, timezone, settings')

    for (const tenant of allTenants || []) {
      try {
        const settings = (tenant.settings || {}) as Record<string, unknown>
        const digestCfg = (settings.staff_reminders || {}) as Record<string, unknown>
        if (digestCfg.enabled === false) continue

        const tz = resolveTenantTz(tenant)
        const digestHour = parseInt(String(digestCfg.digest_hour ?? '7'), 10)
        const local = nowInTz(tz)
        if (local.hour !== digestHour) continue

        // Today's salon-local day expressed as a UTC window
        const dayStart = localToUTC(local.dateStr, '00:00', tz)
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

        const [{ data: apts }, { data: staffList }] = await Promise.all([
          supabase
            .from('appointments')
            .select('id, staff_id, start_time, status, client:clients(first_name, last_name), service:services(name), staff_member:staff!staff_id(name)')
            .eq('tenant_id', tenant.id)
            .gte('start_time', dayStart.toISOString())
            .lt('start_time', dayEnd.toISOString())
            .in('status', ['pending', 'confirmed'])
            .order('start_time'),
          supabase
            .from('staff')
            .select('id, name, email, role, is_active')
            .eq('tenant_id', tenant.id)
            .eq('is_active', true)
            .neq('name', 'Admin'),
        ])

        if (!apts || apts.length === 0) continue // quiet day — no digest spam

        const businessName = tenant.name || 'your salon'
        const dateLabel = formatInTz(dayStart.toISOString(), tz, { weekday: 'long', month: 'long', day: 'numeric' })
        const toEntry = (a: (typeof apts)[number]) => {
          const client = a.client as unknown as { first_name?: string; last_name?: string } | null
          const service = a.service as unknown as { name?: string } | null
          const staffMember = a.staff_member as unknown as { name?: string } | null
          return {
            timeStr: formatInTz(a.start_time, tz, { hour: 'numeric', minute: '2-digit' }),
            clientName: client ? `${client.first_name || ''}${client.last_name ? ' ' + client.last_name : ''}`.trim() || 'Walk-in' : 'Walk-in',
            serviceName: service?.name || 'Service',
            staffName: staffMember?.name || '',
          }
        }

        const ownerStaff = (staffList || []).find(s => s.role === 'owner')
        const ownerEmail = tenant.email || ownerStaff?.email || (settings.owner_email as string) || ''

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let resend: any = null
        if (hasResend) {
          const { Resend } = await import('resend')
          resend = new Resend(process.env.RESEND_API_KEY!)
        }

        // ── Owner: full-day digest (email + optional SMS) ──
        if (ownerEmail && resend) {
          try {
            await resend.emails.send({
              from: `GlowUp <bookings@joinglowup.org>`,
              to: [ownerEmail],
              subject: `📅 Today at ${businessName} — ${apts.length} appointment${apts.length !== 1 ? 's' : ''} (${dateLabel})`,
              html: dailyDigestHtml({
                recipientName: ownerStaff?.name || businessName,
                businessName,
                dateLabel,
                appointments: apts.map(toEntry),
                showStaffColumn: true,
              }),
            })
            digestsSent++
          } catch (err) {
            console.error(`[send-reminders] Owner digest email failed for ${tenant.id}:`, err)
          }
        }
        if (digestCfg.owner_sms === true && tenant.phone && hasSms) {
          const summary = apts.slice(0, 8).map(a => {
            const e = toEntry(a)
            return `${e.timeStr} — ${e.clientName} (${e.serviceName})`
          }).join('\n')
          const more = apts.length > 8 ? `\n…and ${apts.length - 8} more` : ''
          await sendSms(toE164(tenant.phone) || tenant.phone,
            `📅 Today at ${businessName} (${dateLabel}): ${apts.length} appointment${apts.length !== 1 ? 's' : ''}\n${summary}${more}`)
        }

        // ── Each staff member: their own appointments ──
        if (resend) {
          for (const s of staffList || []) {
            if (!s.email || s.role === 'owner') continue // owner already got the full digest
            const mine = apts.filter(a => a.staff_id === s.id)
            if (mine.length === 0) continue
            try {
              await resend.emails.send({
                from: `${businessName} <bookings@joinglowup.org>`,
                replyTo: ownerEmail || undefined,
                to: [s.email],
                subject: `📅 Your schedule today — ${mine.length} appointment${mine.length !== 1 ? 's' : ''} (${dateLabel})`,
                html: dailyDigestHtml({
                  recipientName: s.name,
                  businessName,
                  dateLabel,
                  appointments: mine.map(toEntry),
                }),
              })
              digestsSent++
            } catch (err) {
              console.error(`[send-reminders] Staff digest email failed for ${s.id}:`, err)
            }
          }
        }
      } catch (err) {
        console.error(`[send-reminders] Digest failed for tenant ${tenant.id}:`, err)
      }
    }
  }

  return NextResponse.json({
    message: `Processed reminders`,
    sent: totalSent,
    skipped: totalSkipped,
    failed: totalFailed,
    digests: digestsSent,
  })
}
