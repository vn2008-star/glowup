// ─── Shared Appointment Notification Helpers ───
// Used by both the public booking flow (/api/public-booking) and dashboard-
// created appointments (/api/data → appointments.add) so the two paths send
// identical client confirmations and schedule identical reminders.

import type { SupabaseClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/utils'
import { timezoneFromAddress, DEFAULT_TZ } from '@/lib/tz'
import { bookingConfirmationHtml, rescheduleConfirmationHtml, cancellationConfirmationHtml, ownerNotificationHtml, googleCalendarUrl } from '@/lib/email-templates'

const REMINDER_TYPES = ['24h', '2h', '1h'] as const

/**
 * Resolve a tenant's display timezone.
 *
 * The salon timezone lives in the `tenants.timezone` COLUMN (that's what
 * Settings saves and what the booking page reads). `settings.timezone` in the
 * JSON blob is legacy and usually absent — code that read only the blob showed
 * every salon's emails in Pacific time. Callers must select the `timezone` and
 * `address` columns for this to work.
 */
export function resolveTenantTz(tenant: {
  timezone?: string | null
  address?: string | null
  settings?: Record<string, unknown> | null
} | null | undefined): string {
  if (!tenant) return DEFAULT_TZ
  return tenant.timezone
    || ((tenant.settings || {}) as Record<string, string>).timezone
    || timezoneFromAddress(tenant.address)
    || DEFAULT_TZ
}

/** Format an appointment start for messages, in the salon's timezone. */
export function formatAptWhen(start: Date, tz: string): { dateStr: string; timeStr: string } {
  try {
    return {
      dateStr: start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz }),
      timeStr: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }),
    }
  } catch {
    return {
      dateStr: start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      timeStr: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    }
  }
}

/** Format "James Davis" → "James D." for a friendlier greeting. */
export function greetingName(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || 'there'
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

/**
 * Fill {placeholder} tokens in an owner-authored message template.
 *
 * Owners write these in Settings → Reminders, where the UI advertises tokens
 * like {client_name} and {date}. Without this the raw template ships to the
 * client and they receive a literal "Hi {client_name}!".
 *
 * Two vocabularies exist in the product — Settings uses {client_name}/{service}
 * /{address}, while campaigns use {name}/{greeting}/{booking_url} — so callers
 * should pass both spellings for the same value. An unknown token is dropped
 * rather than delivered: a stray blank beats sending a customer a curly brace.
 *
 * Named for what it does rather than "renderTemplate", because
 * lib/outreach-templates already exports a renderTemplate() that picks a canned
 * marketing email by id — an unrelated job with an unrelated signature.
 */
export function fillPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z_]+)\}/g, (token, rawKey: string) => {
    const key = rawKey.toLowerCase()
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key] ?? ''
    console.warn(`[notifications] Unknown template token ${token} — removed`)
    return ''
  })
}

// SMS delivery is provider-routed (Twilio number OR the owner's own Android
// phone via the SMS Gateway app) — see src/lib/sms.ts. Imported for local use
// and re-exported so existing call sites keep working unchanged.
import { sendSms } from '@/lib/sms'
export { sendSms }

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

/**
 * Notify the OWNER that a client cancelled or rescheduled an appointment.
 * Used by the client-initiated paths (SMS keywords, AI receptionist) — the
 * owner used to learn about an SMS cancellation only when the client didn't
 * show up. Mirrors the owner notice the manage page sends.
 */
export async function sendOwnerChangeNotice(opts: {
  type: 'cancel' | 'reschedule'
  tenant: {
    name: string
    email: string | null
    phone: string | null
    settings: Record<string, unknown> | null
  } | null
  clientName: string
  serviceName: string
  staffName: string
  start: Date
  oldStart?: Date
  tz: string
  /** Where the change came from, e.g. "by SMS reply" or "via AI receptionist". */
  via?: string
}): Promise<void> {
  const { type, tenant, clientName, serviceName, staffName, start, oldStart, tz, via } = opts
  if (!tenant) return

  const { dateStr, timeStr } = formatAptWhen(start, tz)
  const old = oldStart ? formatAptWhen(oldStart, tz) : null
  const emoji = type === 'cancel' ? '❌' : '🔄'
  const action = type === 'cancel' ? 'Cancelled' : 'Rescheduled'

  // SMS to owner (provider-routed: Twilio or the owner's own Android gateway)
  if (tenant.phone) {
    const ownerE164 = toE164(tenant.phone)
    if (ownerE164) {
      const smsBody = [
        `${emoji} Appointment ${action}${via ? ` (${via})` : ''}`,
        ``,
        `Client: ${clientName}`,
        `📋 ${serviceName}`,
        type === 'cancel'
          ? `📅 Was: ${dateStr} at ${timeStr}`
          : `📅 Was: ${old?.dateStr} at ${old?.timeStr}\n📅 New: ${dateStr} at ${timeStr}`,
        staffName ? `💇 Staff: ${staffName}` : '',
      ].filter(Boolean).join('\n')
      try {
        await sendSms(ownerE164, smsBody)
      } catch (err) {
        console.error(`[notifications] ${type} SMS to owner failed:`, err)
      }
    }
  }

  // Email to owner
  const ownerEmail = tenant.email
    || (((tenant.settings || {}) as Record<string, unknown>).owner_email as string)
    || null
  if (ownerEmail && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const html = ownerNotificationHtml({
        type, clientName, serviceName, staffName, dateStr, timeStr,
        oldDateStr: old?.dateStr, oldTimeStr: old?.timeStr,
        businessName: tenant.name,
      })
      await resend.emails.send({
        from: `GlowUp <bookings@joinglowup.org>`,
        to: [ownerEmail],
        subject: `${emoji} ${action}: ${clientName} — ${serviceName}`,
        html,
      })
    } catch (err) {
      console.error(`[notifications] ${type} email to owner failed:`, err)
    }
  }
}

/**
 * Notify the CLIENT that staff rescheduled or cancelled their appointment.
 * Used by the dashboard paths (data route), which previously did neither —
 * the customer's appointment silently moved or vanished.
 */
export async function sendClientChangeNotice(opts: {
  type: 'reschedule' | 'cancel'
  businessName: string
  businessAddress: string
  businessPhone: string
  businessEmail: string | null
  serviceName: string
  staffName: string
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  /** For reschedule: manage link. For cancel: public booking link to rebook. */
  actionLink: string
  start: Date
  end: Date
  timezone: string
}): Promise<void> {
  const {
    type, businessName, businessAddress, businessPhone, businessEmail,
    serviceName, staffName, clientName, clientEmail, clientPhone,
    actionLink, start, end, timezone,
  } = opts

  const greeting = greetingName(clientName)
  const { dateStr, timeStr } = formatAptWhen(start, timezone)
  const isCancel = type === 'cancel'

  // ── SMS ──
  if (clientPhone) {
    const clientE164 = toE164(clientPhone)
    if (clientE164) {
      const sms = isCancel
        ? [
            `❌ Appointment Cancelled`,
            ``,
            `Dear ${greeting}, your ${serviceName} appointment at ${businessName} on ${dateStr} at ${timeStr} has been cancelled.`,
            actionLink ? `Book a new time: ${actionLink}` : '',
            businessPhone ? `Questions? Call us at ${businessPhone}` : '',
          ].filter(Boolean).join('\n')
        : [
            `🔄 Appointment Rescheduled`,
            ``,
            `Dear ${greeting}, your ${serviceName} appointment at ${businessName} has been moved to:`,
            `📅 ${dateStr} at ${timeStr}`,
            staffName ? `💇 With: ${staffName}` : '',
            actionLink ? `Manage: ${actionLink}` : '',
          ].filter(Boolean).join('\n')
      try {
        await sendSms(clientE164, sms)
      } catch (err) {
        console.error(`[notifications] ${type} SMS to client failed:`, err)
      }
    }
  }

  // ── Email ──
  if (clientEmail && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const html = isCancel
        ? cancellationConfirmationHtml({
            greeting, serviceName, dateStr, timeStr, staffName,
            businessName, businessAddress, businessPhone, bookingLink: actionLink,
          })
        : rescheduleConfirmationHtml({
            greeting, serviceName, dateStr, timeStr, staffName,
            businessName, businessAddress, businessPhone, manageLink: actionLink,
            startISO: start.toISOString(), endISO: end.toISOString(),
          })
      await resend.emails.send({
        from: `${businessName} <bookings@joinglowup.org>`,
        replyTo: businessEmail || undefined,
        to: [clientEmail],
        subject: isCancel
          ? `❌ Appointment Cancelled — ${serviceName} on ${dateStr}`
          : `🔄 Appointment Rescheduled — ${serviceName} on ${dateStr}`,
        html,
      })
    } catch (err) {
      console.error(`[notifications] ${type} email to client failed:`, err)
    }
  }
}
