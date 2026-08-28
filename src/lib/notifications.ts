// ─── Shared Appointment Notification Helpers ───
// Used by both the public booking flow (/api/public-booking) and dashboard-
// created appointments (/api/data → appointments.add) so the two paths send
// identical client confirmations and schedule identical reminders.

import type { SupabaseClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/utils'
import { timezoneFromAddress, DEFAULT_TZ } from '@/lib/tz'
import { bookingConfirmationHtml, rescheduleConfirmationHtml, cancellationConfirmationHtml, ownerNotificationHtml, googleCalendarUrl } from '@/lib/email-templates'

/**
 * Every reminder lead time the app schedules. A row is created for each of
 * these regardless of the salon's settings — send-reminders decides at send
 * time whether the owner has that timing/channel switched on, so flipping a
 * toggle in Settings also applies to appointments that are already booked.
 */
export const REMINDER_TYPES = ['24h', '2h', '1h', '30m'] as const

/**
 * Values migration 006 allowed. Anything outside these needs
 * 20260828_reminders_30m_owner.sql applied — see insertReminderRows.
 */
const LEGACY_TYPES: ReadonlySet<string> = new Set(['24h', '2h', '1h'])
const LEGACY_CHANNELS: ReadonlySet<string> = new Set(['sms', 'email'])

export type ReminderRow = {
  tenant_id: string
  appointment_id: string
  client_id: string
  type: string
  channel: string
  status: string
}

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

/**
 * Resolve a salon's arrival instructions — how to find the suite, where to
 * park, what to do on arrival. Lives in the `tenants.settings` JSON blob
 * (`special_instructions`), so no schema change is needed; callers must select
 * the `settings` column.
 *
 * Emails always show them. SMS only when the salon ticks the box, because the
 * text is long and the reminder SMS already carries emoji — which forces UCS-2
 * at 67 chars per segment, so a typical note adds ~3 billable segments to every
 * message.
 */
export function resolveSpecialInstructions(tenant: {
  settings?: Record<string, unknown> | null
} | null | undefined): { text: string; includeInSms: boolean } {
  const settings = (tenant?.settings || {}) as Record<string, unknown>
  const raw = settings.special_instructions
  const text = typeof raw === 'string' ? raw.trim() : ''
  return { text, includeInSms: !!text && settings.special_instructions_sms === true }
}

/** Append arrival instructions to an SMS body, if this salon opted in. */
export function appendInstructionsToSms(
  body: string,
  instructions: { text: string; includeInSms: boolean },
): string {
  if (!instructions.includeInSms) return body
  return `${body}\n\n📌 ${instructions.text}`
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
import { sendSms, type TenantSmsConfig } from '@/lib/sms'
export { sendSms }
export type { TenantSmsConfig }

/**
 * Build the pending reminder rows for one appointment — every lead time in
 * REMINDER_TYPES, on every channel that could carry it:
 *
 *   sms / email         → the client, but only where we can reach them
 *                         (phone → sms, email → email)
 *   owner_sms / owner_email → the salon owner's copy of the same nudge
 *
 * Owner rows are always built, even for salons that have owner reminders
 * switched off; send-reminders reads settings.reminders and skips the ones the
 * owner didn't ask for. Scheduling them unconditionally is what lets a salon
 * turn "30 minutes before" on today and have tomorrow's existing bookings
 * honour it.
 */
export function buildReminderRows(opts: {
  tenantId: string
  appointmentId: string
  clientId: string
  clientPhone: string | null
  clientEmail: string | null
}): ReminderRow[] {
  const { tenantId, appointmentId, clientId, clientPhone, clientEmail } = opts
  const base = { tenant_id: tenantId, appointment_id: appointmentId, client_id: clientId, status: 'pending' }
  const rows: ReminderRow[] = []
  for (const type of REMINDER_TYPES) {
    if (clientPhone) rows.push({ ...base, type, channel: 'sms' })
    if (clientEmail) rows.push({ ...base, type, channel: 'email' })
    rows.push({ ...base, type, channel: 'owner_sms' })
    rows.push({ ...base, type, channel: 'owner_email' })
  }
  return rows
}

/**
 * Insert reminder rows in two batches: the types/channels migration 006 always
 * allowed, then the ones added by 20260828_reminders_30m_owner.sql.
 *
 * They must not share an INSERT. A multi-row INSERT is atomic, so on a database
 * where that migration hasn't run yet the CHECK violation on a single '30m' row
 * would roll back the 24h/2h/1h rows with it and the appointment would end up
 * with no reminders at all — exactly the failure migration 006's own notes
 * describe. Split, the worst case is losing the new rows and logging why.
 */
export async function insertReminderRows(
  svc: SupabaseClient,
  rows: ReminderRow[],
  tag = 'notifications',
): Promise<number> {
  const isLegacy = (r: ReminderRow) => LEGACY_TYPES.has(r.type) && LEGACY_CHANNELS.has(r.channel)
  const batches: [string, ReminderRow[]][] = [
    ['legacy', rows.filter(isLegacy)],
    ['30m/owner', rows.filter(r => !isLegacy(r))],
  ]
  let inserted = 0
  for (const [label, batch] of batches) {
    if (batch.length === 0) continue
    const { error } = await svc.from('appointment_reminders').insert(batch)
    if (error) {
      console.error(
        `[${tag}] Failed to create ${label} reminders`,
        label === '30m/owner'
          ? '— is supabase/migrations/20260828_reminders_30m_owner.sql applied?'
          : '',
        error,
      )
      continue
    }
    inserted += batch.length
  }
  return inserted
}

/**
 * Schedule every reminder for a client appointment (client copies + the
 * owner's copies). The send-reminders cron picks these up and skips the ones
 * the tenant has switched off or the client opted out of.
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
  return insertReminderRows(svc, buildReminderRows(opts))
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
  /** This salon's own gateway phone; omit to use the platform provider. */
  smsConfig?: TenantSmsConfig | null
  logoUrl?: string | null
  /** From resolveSpecialInstructions(tenant) — arrival notes for the client. */
  specialInstructions?: { text: string; includeInSms: boolean }
}): Promise<void> {
  const {
    businessName, businessAddress, businessPhone, businessEmail,
    serviceName, staffName, clientName, clientEmail, clientPhone,
    manageLink, start, end, timezone, smsConfig, logoUrl,
    specialInstructions = { text: '', includeInSms: false },
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
        const ok = await sendSms(clientE164, appendInstructionsToSms(clientSms, specialInstructions), smsConfig)
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
        logoUrl, specialInstructions: specialInstructions.text,
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
  /** This salon's own gateway phone; omit to use the platform provider. */
  smsConfig?: TenantSmsConfig | null
}): Promise<void> {
  const { type, tenant, clientName, serviceName, staffName, start, oldStart, tz, via, smsConfig } = opts
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
        await sendSms(ownerE164, smsBody, smsConfig)
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
  /** This salon's own gateway phone; omit to use the platform provider. */
  smsConfig?: TenantSmsConfig | null
  logoUrl?: string | null
  /** From resolveSpecialInstructions(tenant) — arrival notes for the client. */
  specialInstructions?: { text: string; includeInSms: boolean }
}): Promise<void> {
  const {
    type, businessName, businessAddress, businessPhone, businessEmail,
    serviceName, staffName, clientName, clientEmail, clientPhone,
    actionLink, start, end, timezone, smsConfig, logoUrl,
    specialInstructions = { text: '', includeInSms: false },
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
      // Cancellations don't get arrival notes — there's nothing to arrive at.
      const smsBody = isCancel ? sms : appendInstructionsToSms(sms, specialInstructions)
      try {
        await sendSms(clientE164, smsBody, smsConfig)
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
            logoUrl,
          })
        : rescheduleConfirmationHtml({
            greeting, serviceName, dateStr, timeStr, staffName,
            businessName, businessAddress, businessPhone, manageLink: actionLink,
            startISO: start.toISOString(), endISO: end.toISOString(),
            logoUrl, specialInstructions: specialInstructions.text,
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
