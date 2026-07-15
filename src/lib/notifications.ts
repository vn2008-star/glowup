// ─── Shared Appointment Notification Helpers ───
// Used by both the public booking flow (/api/public-booking) and dashboard-
// created appointments (/api/data → appointments.add) so the two paths send
// identical client confirmations and schedule identical reminders.

import type { SupabaseClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/utils'
import { bookingConfirmationHtml, googleCalendarUrl } from '@/lib/email-templates'

const REMINDER_TYPES = ['24h', '2h', '1h'] as const

/** Format "James Davis" → "James D." for a friendlier greeting. */
export function greetingName(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || 'there'
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

/** Send an SMS via the Twilio REST API (no SDK — works in Edge/Serverless). */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) {
    console.log(`[notifications] [DRY RUN] SMS to ${to}: ${body}`)
    return false
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
  const auth = btoa(`${sid}:${token}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  })
  if (!res.ok) {
    const errBody = await res.text()
    console.error(`[notifications] Twilio API error (${res.status}): ${errBody}`)
    return false
  }
  const result = await res.json()
  console.log(`[notifications] Twilio SMS queued: sid=${result.sid} status=${result.status}`)
  return true
}

/**
 * Insert pending 24h/2h/1h reminder rows for a client appointment.
 * Only creates rows for channels the client can actually receive on
 * (phone → sms, email → email). The hourly send-reminders cron picks these up
 * and skips them if the tenant has reminders disabled or the client opted out.
 */
export async function scheduleClientReminders(
  svc: SupabaseClient,
  opts: {
    tenantId: string
    appointmentId: string
    clientId: string
    clientPhone: string | null
    clientEmail: string | null
  }
): Promise<number> {
  const { tenantId, appointmentId, clientId, clientPhone, clientEmail } = opts
  const rows: { tenant_id: string; appointment_id: string; client_id: string; type: string; channel: string; status: string }[] = []
  for (const type of REMINDER_TYPES) {
    if (clientPhone) rows.push({ tenant_id: tenantId, appointment_id: appointmentId, client_id: clientId, type, channel: 'sms', status: 'pending' })
    if (clientEmail) rows.push({ tenant_id: tenantId, appointment_id: appointmentId, client_id: clientId, type, channel: 'email', status: 'pending' })
  }
  if (rows.length === 0) return 0
  const { error } = await svc.from('appointment_reminders').insert(rows)
  if (error) {
    console.error('[notifications] Failed to create reminders:', error)
    return 0
  }
  return rows.length
}

/**
 * Send the booking-confirmation SMS + email to the CLIENT (not the owner).
 * Mirrors the client-facing messages sent by the public booking flow.
 */
export async function sendClientBookingConfirmation(opts: {
  businessName: string
  businessAddress: string
  businessPhone: string
  businessEmail: string | null
  serviceName: string
  staffName: string
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  manageLink: string
  start: Date
  end: Date
  timezone: string
}): Promise<void> {
  const {
    businessName, businessAddress, businessPhone, businessEmail,
    serviceName, staffName, clientName, clientEmail, clientPhone,
    manageLink, start, end, timezone,
  } = opts

  const greeting = greetingName(clientName)

  let dateStr: string, timeStr: string
  try {
    dateStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone })
    timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone })
  } catch {
    dateStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  // ── SMS to client ──
  if (clientPhone) {
    const clientE164 = toE164(clientPhone)
    if (clientE164) {
      const calTitle = `${serviceName} — ${businessName}`
      const calLocation = businessAddress ? `${businessName}, ${businessAddress}` : businessName
      const gcalLink = googleCalendarUrl({ title: calTitle, startISO: start.toISOString(), endISO: end.toISOString(), location: calLocation })
      const clientSms = [
        `✅ Booking Confirmed!`,
        ``,
        `Dear ${greeting}, your appointment is booked:`,
        `📋 ${serviceName}`,
        `📅 ${dateStr} at ${timeStr}`,
        staffName ? `💇 With: ${staffName}` : '',
        businessAddress ? `📍 ${businessName}, ${businessAddress}` : `📍 ${businessName}`,
        businessPhone ? `📞 ${businessPhone}` : '',
        ``,
        `📅 Add to Calendar: ${gcalLink}`,
        ``,
        manageLink ? `Manage your appointment: ${manageLink}` : `Need to change? Contact us at ${businessPhone || 'the salon'}.`,
      ].filter(Boolean).join('\n')
      try {
        const ok = await sendSms(clientE164, clientSms)
        if (ok) console.log(`[notifications] ✅ Confirmation SMS sent to client ${clientE164}`)
      } catch (err) {
        console.error(`[notifications] SMS to client failed:`, err)
      }
    } else {
      console.warn(`[notifications] ⚠️ Could not normalize client phone: "${clientPhone}"`)
    }
  }

  // ── Email to client ──
  if (clientEmail && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const html = bookingConfirmationHtml({
        greeting, serviceName, dateStr, timeStr, staffName,
        businessName, businessAddress, businessPhone, manageLink,
        startISO: start.toISOString(), endISO: end.toISOString(),
      })
      await resend.emails.send({
        from: `${businessName} <bookings@joinglowup.org>`,
        replyTo: businessEmail || undefined,
        to: [clientEmail],
        subject: `✅ Booking Confirmed — ${serviceName} on ${dateStr}`,
        html,
      })
      console.log(`[notifications] ✅ Confirmation email sent to client ${clientEmail}`)
    } catch (err) {
      console.error(`[notifications] Email to client failed:`, err)
    }
  } else if (clientEmail) {
    console.log(`[notifications] [DRY RUN] Client email to ${clientEmail}`)
  }
}
