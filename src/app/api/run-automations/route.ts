import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/utils'
import { verifyCronRequest } from '@/lib/cron-auth'
import { promoEmailHtml } from '@/lib/email-templates'
import { sendSms, smsProvider, canSendBulkSms, smsConfigFromSettings, type TenantSmsConfig } from '@/lib/sms'
import { PROMO_HOLIDAYS, getNextHolidayDate, DEFAULT_BIRTHDAY_TEMPLATE } from '@/lib/schedule-utils'
import { siteBaseUrl } from '@/lib/site-url'
import { resolveTenantTz } from '@/lib/notifications'
import { nowInTz, formatInTz } from '@/lib/tz'

/** Hour, in each salon's own timezone, when the once-a-day automations run. */
const DAILY_AUTOMATION_HOUR = 9

// ─── Automation Engine (Cron-triggered) ───
// Runs daily. Checks each tenant's automation settings and fires:
// - Birthday Auto-Send (7 days before birthday)
// - Rebooking Reminder (based on service cycle, default 30 days)
// - No-Show Follow-Up (1 hour after missed appointment)
// - Review Request (2 hours after completed service)

type Channel = 'sms' | 'email' | 'both'

/**
 * Is this automation switched on? Automations default ON — the app has always
 * sent these unless a salon explicitly opted out.
 *
 * An automation may answer to more than one settings key. The Review Request
 * toggle in Settings writes `auto_review_request`, but this route only ever
 * read `auto_review`, so unticking the box did nothing and the review texts
 * kept going out. Both are honoured; the first key carrying an explicit
 * boolean wins, so the toggle a salon actually used is the one that counts.
 */
function automationOn(automations: Record<string, boolean | string>, ...keys: string[]): boolean {
  for (const key of keys) {
    if (typeof automations[key] === 'boolean') return automations[key] as boolean
  }
  return true
}

/**
 * The delivery channel a salon picked for an automation, from the "Send via:"
 * picker on the automation card. Anything unrecognised (or unset) falls back.
 */
function automationChannel(
  automations: Record<string, boolean | string>,
  key: string,
  fallback: Channel = 'both',
): Channel {
  const value = String(automations[key] || '')
  return (['sms', 'email', 'both'].includes(value) ? value : fallback) as Channel
}

export async function GET(request: Request) {
  // Auth: only allow Vercel Cron or manual call with CRON_SECRET
  const unauthorized = verifyCronRequest(request)
  if (unauthorized) return unauthorized

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const hasSms = smsProvider() !== null
  const hasResend = !!process.env.RESEND_API_KEY

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resendClient: any = null
  if (hasResend) {
    const { Resend } = await import('resend')
    resendClient = new Resend(process.env.RESEND_API_KEY!)
  }

  // Fetch all tenants with automation settings
  const { data: tenants } = await supabase
    .from('tenants')
    // timezone + address feed resolveTenantTz — every schedule decision below
    // is made in the salon's local time, not the server's UTC.
    .select('id, name, email, slug, logo_url, settings, timezone, address')

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ message: 'No tenants found', processed: 0 })
  }

  // Holiday calendar lives in @/lib/schedule-utils (PROMO_HOLIDAYS) so this
  // route and the campaigns UI can't drift apart.

  const results: Record<string, number> = {
    birthday: 0,
    rebooking: 0,
    noshow: 0,
    review: 0,
    fill_openings: 0,
    holiday_promo: 0,
  }

  for (const tenant of tenants) {
    const settings = (tenant.settings || {}) as Record<string, unknown>
    const automations = (settings.automations || {}) as Record<string, boolean | string>
    // This salon's own phone, if it has the SMS Gateway app set up
    const smsConfig = smsConfigFromSettings(settings)
    const businessName = tenant.name || 'our salon'
    const baseUrl = siteBaseUrl()
    const bookingUrl = `${baseUrl}/book/${tenant.slug}`
    const businessEmail = tenant.email || ''
    // Every "what time is it" decision below is the SALON's local time. Judging
    // by UTC meant a 9 AM send hour fired at 2 AM in California.
    const tz = resolveTenantTz(tenant)
    const localNow = nowInTz(tz)
    const localDayName = formatInTz(new Date().toISOString(), tz, { weekday: 'long' })

    // ── Fill My Openings Auto-Blast ──
    if (automations.auto_fill_openings) {
      // Schedule gate: only fire on the configured days + hour, read in the
      // salon's own timezone. These were compared against UTC while the cron
      // only ever ran at 09:00 UTC, so a salon whose send hour wasn't 9 never
      // got a blast at all — and the salon whose was got it at 2 AM local.
      const scheduleDays = String(automations.auto_fill_openings_schedule_days || 'Monday').split(',').filter(Boolean)
      const sendHour = parseInt(String(automations.auto_fill_openings_send_hour || '9'), 10)

      if (!scheduleDays.includes(localDayName) || localNow.hour !== sendHour) {
        // Not the right day/hour — skip FMO for this tenant
      } else {

      const lookAheadDays = parseInt(String(automations.auto_fill_openings_days || '3'), 10)
      const fmoChannel = String(automations.auto_fill_openings_channel || 'both') as 'sms' | 'email' | 'both'
      const fmoAudience = String(automations.auto_fill_openings_audience || 'all')
      const fmoListName = String(automations.auto_fill_openings_list || '')

      // Fetch staff + appointments for slot detection
      const { data: staffList } = await supabase
        .from('staff')
        .select('id, name, is_active, schedule')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)

      const now = new Date()
      const lookAheadEnd = new Date(now)
      lookAheadEnd.setDate(lookAheadEnd.getDate() + lookAheadDays)

      const { data: aptList } = await supabase
        .from('appointments')
        .select('id, staff_id, start_time, end_time, status')
        .eq('tenant_id', tenant.id)
        .neq('status', 'cancelled')
        .gte('start_time', now.toISOString())
        .lte('start_time', lookAheadEnd.toISOString())

      // Detect open slots (server-side version of the client-side detectOpenSlots)
      const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      let totalOpenSlots = 0
      const slotDescriptions: string[] = []

      function parseTime(t: string): number {
        const [h, m] = t.split(':').map(Number)
        return h + (m || 0) / 60
      }

      for (let d = 0; d < lookAheadDays; d++) {
        const date = new Date(now)
        date.setDate(date.getDate() + d)
        const dayName = DAY_NAMES[date.getDay()]
        const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

        for (const s of (staffList || [])) {
          const sched = (s.schedule && typeof s.schedule === 'object' && Object.keys(s.schedule).length > 0)
            ? s.schedule as Record<string, { open?: string; close?: string; start?: string; end?: string; off?: boolean; useSlots?: boolean; slots?: { start: string; end: string }[] }>
            : null
          const dayConfig = sched?.[dayName]
          if (dayConfig?.off) continue
          if (!dayConfig && date.getDay() === 0) continue

          // Build booked intervals
          const booked: { start: number; end: number }[] = []
          for (const apt of (aptList || [])) {
            if (apt.staff_id !== s.id) continue
            const aptDate = new Date(apt.start_time)
            const aptDateStr = `${aptDate.getFullYear()}-${String(aptDate.getMonth()+1).padStart(2,'0')}-${String(aptDate.getDate()).padStart(2,'0')}`
            if (aptDateStr !== dateStr) continue
            const startH = aptDate.getHours() + aptDate.getMinutes() / 60
            const endDate = new Date(apt.end_time)
            const endH = endDate.getHours() + endDate.getMinutes() / 60
            booked.push({ start: startH, end: endH })
          }
          booked.sort((a, b) => a.start - b.start)

          // Determine work windows — either custom slots or one continuous block
          const useCustomSlots = dayConfig?.useSlots && dayConfig.slots && dayConfig.slots.length > 0
          const workWindows: { start: number; end: number }[] = []

          if (useCustomSlots) {
            for (const sl of dayConfig!.slots!) {
              const slStart = parseTime(sl.start)
              const slEnd = parseTime(sl.end)
              if (slEnd > slStart) workWindows.push({ start: slStart, end: slEnd })
            }
          } else {
            const workStart = dayConfig?.open ? parseTime(dayConfig.open) : (dayConfig?.start ? parseInt(dayConfig.start, 10) : 9)
            const workEnd = dayConfig?.close ? parseTime(dayConfig.close) : (dayConfig?.end ? parseInt(dayConfig.end, 10) : 17)
            if (workEnd > workStart) workWindows.push({ start: workStart, end: workEnd })
          }

          // For each work window, subtract booked intervals and count open slots
          for (const win of workWindows) {
            let cursor = win.start
            for (const b of booked) {
              if (b.end <= win.start || b.start >= win.end) continue
              const bStart = Math.max(b.start, win.start)
              if (bStart > cursor && (bStart - cursor) >= 0.5) totalOpenSlots++
              cursor = Math.max(cursor, Math.min(b.end, win.end))
            }
            if (win.end > cursor && (win.end - cursor) >= 0.5) totalOpenSlots++
          }
        }

        // Build a human-readable summary for the first few days
        if (totalOpenSlots > 0 && slotDescriptions.length < 3) {
          const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          slotDescriptions.push(dateLabel)
        }
      }

      // Only blast if there are open slots
      if (totalOpenSlots > 0) {
        // Build recipient query
        let clientQuery = supabase
          .from('clients')
          .select('id, first_name, last_name, phone, email, sms_opt_out, status, visit_count, lifetime_spend')
          .eq('tenant_id', tenant.id)
          .limit(200)

        if (fmoAudience === 'active') clientQuery = clientQuery.eq('status', 'active')
        else if (fmoAudience === 'at_risk') clientQuery = clientQuery.eq('status', 'at_risk')
        else if (fmoAudience === 'vip') clientQuery = clientQuery.or('visit_count.gte.10,lifetime_spend.gte.500')
        else if (fmoAudience === 'saved_list' && fmoListName) {
          // Fetch saved list client IDs from settings
          const savedLists = (settings.savedClientLists || []) as { name: string; clientIds: string[] }[]
          const targetList = savedLists.find(l => l.name === fmoListName)
          if (targetList && targetList.clientIds.length > 0) {
            clientQuery = clientQuery.in('id', targetList.clientIds)
          } else {
            continue // skip if saved list not found or empty
          }
        }

        const { data: recipients } = await clientQuery

        if (recipients && recipients.length > 0) {
          // One date per line. Joining them with commas ran the day and date
          // together — "Mon, Aug 10, Tue, Aug 11" reads as six separate items.
          // Plain bullets, NOT 📅: Android draws that emoji as a calendar page
          // with "July 17" printed on it, so every row contradicted its own date.
          const slotLines = slotDescriptions.length > 0
            ? slotDescriptions.map(d => `• ${d}`).join('\n')
            : `• In the next ${lookAheadDays} day${lookAheadDays !== 1 ? 's' : ''}`
          const message = [
            `Hey {name}! ⚡`,
            ``,
            `We have openings coming up:`,
            ``,
            slotLines,
            ``,
            `Book now before they're gone → ${bookingUrl}`,
          ].join('\n')

          for (const client of recipients) {
            const clientFirst = `${client.first_name || ''}`.trim() || 'there'
            const clientGreeting = client.last_name
              ? `${clientFirst} ${client.last_name[0]}.`
              : clientFirst
            const personalizedMsg = message.replace(/\{name\}/g, clientGreeting)

            await sendMessage({
              client,
              message: personalizedMsg,
              businessName,
              businessEmail,
              resendClient,
              logoUrl: tenant.logo_url,
              channel: fmoChannel,
              bulk: true,
              subject: `⚡ Openings this week at ${businessName}`,
              ctaUrl: bookingUrl,
              ctaText: 'Book Now',
            })
            results.fill_openings++
          }

          // Log as campaign
          await supabase.from('campaigns').insert({
            tenant_id: tenant.id,
            name: `[Auto] Fill My Openings — ${new Date().toLocaleDateString()}`,
            type: 'fill_openings',
            status: 'completed',
            last_sent: new Date().toISOString(),
            template: { audience: fmoAudience, channel: fmoChannel, days: lookAheadDays, slots: totalOpenSlots },
            metrics: { sent: results.fill_openings, opened: 0, booked: 0, revenue: 0 },
          })
        }
      }
      } // end schedule gate else
    }

    // ── Daily automations gate ──
    // Birthday, rebooking and holiday promos should land once a day. The cron
    // ticks hourly, so they fire on the tick where it is DAILY_AUTOMATION_HOUR
    // in the salon's own timezone — the same shape as the daily digest in
    // send-reminders.
    //
    // This gate previously compared against 8 AM *UTC* while vercel.json ran
    // the cron at 09:00 UTC, so it was never once true: birthday, rebooking,
    // no-show, review and holiday promos had never run in production. Only
    // Fill My Openings worked, because it sits above the gate.
    if (localNow.hour === DAILY_AUTOMATION_HOUR) {

    // ── Birthday Auto-Send ──
    // Discount, lead time, channel, and message are per-business settings
    // (configured on the Loyalty page); the old 20%/7-day/both defaults apply
    // when the owner hasn't customized anything.
    if (automationOn(automations, 'auto_birthday')) {
      const bdayDiscount = String(automations.auto_birthday_discount || '20')
      const bdayDaysBefore = parseInt(String(automations.auto_birthday_days || '7'), 10) || 7
      const bdayChannel = automationChannel(automations, 'auto_birthday_channel')
      const bdayTemplate = String(automations.auto_birthday_message || '') || DEFAULT_BIRTHDAY_TEMPLATE

      // Work from the salon's local date. Date.UTC handles the month/year
      // rollover when the lead time crosses a boundary.
      const [ly, lm, ld] = localNow.dateStr.split('-').map(Number)
      const targetDate = new Date(Date.UTC(ly, lm - 1, ld + bdayDaysBefore))
      const targetMonth = targetDate.getUTCMonth() + 1
      const targetDay = targetDate.getUTCDate()

      const { data: birthdayClients } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, email, sms_opt_out, birthday')
        .eq('tenant_id', tenant.id)
        .not('birthday', 'is', null)

      if (birthdayClients) {
        for (const client of birthdayClients) {
          if (!client.birthday) continue
          // Read the stored date as text. `new Date('1983-11-17')` is UTC
          // midnight, and getMonth()/getDate() are local, so west of UTC every
          // birthday read back a day early.
          const bday = String(client.birthday).match(/^\d{4}-(\d{2})-(\d{2})/)
          if (!bday) continue
          if (Number(bday[1]) !== targetMonth || Number(bday[2]) !== targetDay) continue

          const clientFirst = `${client.first_name || ''}`.trim() || 'there'
          const clientGreeting = client.last_name
            ? `${clientFirst} ${(client.last_name as string)[0]}.`
            : clientFirst
          const message = bdayTemplate
            .replace(/\{name\}/g, clientGreeting)
            .replace(/\{greeting\}/g, clientGreeting)
            .replace(/\{discount\}/g, bdayDiscount)
            .replace(/\{business_name\}/g, businessName)
            .replace(/\{booking_url\}/g, bookingUrl)

          await sendMessage({
            client, message, businessName, businessEmail, resendClient, smsConfig, channel: bdayChannel,
            logoUrl: tenant.logo_url,
            subject: `🎂 Happy Birthday from ${businessName} — ${bdayDiscount}% off for you!`,
            ctaUrl: bookingUrl,
            ctaText: 'Book Your Birthday Treat',
          })
          results.birthday++
        }
      }
    }

    // ── Rebooking Reminder (clients not seen in configured service cycle) ──
    if (automationOn(automations, 'auto_rebooking')) {
      const cycleDays = parseInt(String(automations.auto_rebooking_cycle || '30'), 10)
      const cycleAgo = new Date()
      cycleAgo.setDate(cycleAgo.getDate() - cycleDays)

      const { data: staleCandidates } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, email, sms_opt_out, last_visit, preferences')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .not('last_visit', 'is', null)
        .lte('last_visit', cycleAgo.toISOString())
        .limit(200)

      // One nudge per client per cycle. Nothing used to filter on the "already
      // reminded" marker, so every stale client would have been re-sent on
      // every run — daily spam until they booked.
      const staleClients = (staleCandidates || []).filter(c => {
        const prefs = (c.preferences || {}) as Record<string, unknown>
        const last = typeof prefs.last_rebooking_sent === 'string' ? Date.parse(prefs.last_rebooking_sent) : NaN
        return Number.isNaN(last) || last < cycleAgo.getTime()
      }).slice(0, 50) // batch

      if (staleClients) {
        for (const client of staleClients) {
          const clientFirst = `${client.first_name || ''}`.trim() || 'there'
          const clientGreeting = client.last_name
            ? `${clientFirst} ${(client.last_name as string)[0]}.`
            : clientFirst
          const daysSince = Math.round((Date.now() - new Date(client.last_visit).getTime()) / (1000 * 60 * 60 * 24))
          const message = [
            `Dear ${clientGreeting},`,
            ``,
            `It's been ${daysSince} days since your last visit to ${businessName}. Time for a refresh? 💜`,
            ``,
            `Book now → ${bookingUrl}`,
          ].join('\n')

          await sendMessage({
            client, message, businessName, businessEmail, resendClient, smsConfig,
            channel: automationChannel(automations, 'auto_rebooking_channel'), bulk: true,
            logoUrl: tenant.logo_url,
            subject: `💜 We miss you at ${businessName} — time for a refresh?`,
            ctaUrl: bookingUrl,
            ctaText: 'Book Now',
          })
          results.rebooking++

          // Mark client as reminded to prevent duplicate sends.
          // This used to write the marker into `notes`, REPLACING it — one run
          // would have wiped the salon's own notes ("Classic size 12 — allergy
          // gel") for up to 50 clients. The marker lives in the preferences
          // blob instead, alongside whatever is already there.
          await supabase
            .from('clients')
            .update({
              preferences: {
                ...((client.preferences || {}) as Record<string, unknown>),
                last_rebooking_sent: new Date().toISOString(),
              },
            })
            .eq('id', client.id)
        }
      }
    }

    } // end daily gate — no-show and review are hourly, see below

    // ── No-Show Follow-Up ──
    // Hourly, not daily: this looks at appointments 2-4 hours old, a window a
    // once-a-day run would step over almost every time. Safe to repeat because
    // it skips anything already marked in the appointment's notes.
    if (automationOn(automations, 'auto_noshow')) {
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

          const clientFirst = `${client.first_name || ''}`.trim() || 'there'
          const clientGreeting = client.last_name
            ? `${clientFirst} ${(client.last_name as string)[0]}.`
            : clientFirst
          const message = [
            `Dear ${clientGreeting},`,
            ``,
            `We missed you today at ${businessName}! 😊`,
            ``,
            `Life happens — we'd love to help you rebook.`,
            ``,
            `Book your next visit → ${bookingUrl}`,
          ].join('\n')

          await sendMessage({
            client, message, businessName, businessEmail, resendClient, smsConfig,
            channel: automationChannel(automations, 'auto_noshow_channel'),
            logoUrl: tenant.logo_url,
            subject: `We missed you today at ${businessName} 😊`,
            ctaUrl: bookingUrl,
            ctaText: 'Rebook Now',
          })
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
    if (automationOn(automations, 'auto_review', 'auto_review_request')) {
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

          const clientFirst = `${client.first_name || ''}`.trim() || 'there'
          const clientGreeting = client.last_name
            ? `${clientFirst} ${(client.last_name as string)[0]}.`
            : clientFirst
          const googleReviewUrl = (settings.google_review_url as string) || ''
          let message = [
            `Thanks for visiting ${businessName} today, ${clientGreeting}! 🌟`,
            ``,
            `We'd love a quick review — it means the world to us ❤️`,
          ].join('\n')
          if (googleReviewUrl) {
            message += `\n\nLeave a review → ${googleReviewUrl}`
          }

          const reviewChannel = automationChannel(automations, 'auto_review_channel', 'sms')
          await sendMessage({
            client, message, businessName, businessEmail, resendClient, smsConfig, channel: reviewChannel,
            logoUrl: tenant.logo_url,
            subject: `🌟 How was your visit to ${businessName}?`,
            ctaUrl: googleReviewUrl || undefined,
            ctaText: 'Leave a Review',
          })
          results.review++

          // Mark as requested
          await supabase
            .from('appointments')
            .update({ notes: `${apt.notes || ''}\n[Auto] Review request sent ${new Date().toLocaleDateString()}` })
            .eq('id', apt.id)
        }
      }
    }

    // ── Holiday Promo Auto-Send ──
    // Back inside the daily gate: one promo per holiday, not one per hour.
    if (localNow.hour === DAILY_AUTOMATION_HOUR) {
    if (automationOn(automations, 'auto_holiday')) {
      const holidaySettings = (settings.holiday_settings || {}) as Record<string, number>
      const sendDaysBefore = holidaySettings.send_days_before ?? 7
      const today = new Date()

      for (const holiday of PROMO_HOLIDAYS) {
        // Next occurrence — floating holidays resolve per year, so this never
        // fires against a stale date.
        const holidayDate = getNextHolidayDate(holiday, today)
        if (!holidayDate) continue  // lookup table doesn't reach this year yet

        const daysUntil = Math.ceil((holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        // Only fire on the exact target day
        if (daysUntil !== sendDaysBefore) continue

        // Check if we already sent this holiday promo this year (prevent duplicate)
        const campaignName = `[Auto] ${holiday.emoji} ${holiday.name} — ${holidayDate.getFullYear()}`
        const { data: existingCampaign } = await supabase
          .from('campaigns')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('name', campaignName)
          .maybeSingle()

        if (existingCampaign) continue // Already sent

        // Fetch all clients for this tenant
        const { data: holidayClients } = await supabase
          .from('clients')
          .select('id, first_name, last_name, phone, email, sms_opt_out')
          .eq('tenant_id', tenant.id)
          .limit(500)

        if (!holidayClients || holidayClients.length === 0) continue

        let holidaySent = 0
        for (const client of holidayClients) {
          const clientFirst = `${client.first_name || ''}`.trim() || 'there'
          const clientGreeting = client.last_name
            ? `${clientFirst} ${(client.last_name as string)[0]}.`
            : clientFirst
          const personalizedMsg = holiday.template
            .replace(/\{name\}/g, clientGreeting)
            .replace(/\{booking_url\}/g, bookingUrl)
            .replace(/\{business_name\}/g, businessName)

          await sendMessage({
            client, message: personalizedMsg, businessName, businessEmail, resendClient, smsConfig, channel: 'both', bulk: true,
            logoUrl: tenant.logo_url,
            subject: `${holiday.emoji} ${holiday.name} Special at ${businessName}!`,
            ctaUrl: bookingUrl,
            ctaText: 'Book Now',
          })
          holidaySent++
        }

        results.holiday_promo += holidaySent

        // Log as campaign
        await supabase.from('campaigns').insert({
          tenant_id: tenant.id,
          name: campaignName,
          type: 'holiday',
          status: 'completed',
          last_sent: new Date().toISOString(),
          template: { holiday: holiday.name, channel: 'both', days_before: sendDaysBefore },
          metrics: { sent: holidaySent, opened: 0, booked: 0, revenue: 0 },
        })
      }
    }
    }
    } // end daily gate (holiday promo)

  return NextResponse.json({
    message: 'Automations processed',
    results,
    dry_run: !hasSms && !hasResend,
  })
}

// ─── Helper: Send SMS/Email ───
async function sendMessage(opts: {
  client: Record<string, unknown>
  message: string
  businessName: string
  businessEmail: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resendClient: any
  channel: 'sms' | 'email' | 'both'
  /** Campaign-style mass send. Bulk SMS needs a registered business number —
   *  on the Android-phone provider these fall back to email-only. */
  bulk?: boolean
  subject?: string
  ctaUrl?: string
  ctaText?: string
  /** This salon's own gateway phone, when it has one set up. */
  smsConfig?: TenantSmsConfig | null
  logoUrl?: string | null
}) {
  const { client, message, businessName, businessEmail, resendClient, channel, bulk, subject, ctaUrl, ctaText, smsConfig, logoUrl } = opts

  // SMS
  if ((channel === 'sms' || channel === 'both') && client.phone && !client.sms_opt_out) {
    const phoneE164 = toE164(client.phone as string)
    if (!phoneE164) {
      console.warn(`[run-automations] ⚠️ Could not normalize phone: "${client.phone}"`)
    } else if (bulk && !canSendBulkSms(smsConfig)) {
      console.log(`[run-automations] Bulk SMS to ${phoneE164} skipped — no registered business number (email-only)`)
    } else {
      const ok = await sendSms(phoneE164, message, smsConfig)
      if (!ok) console.error(`SMS send failed for ${client.phone}`)
    }
  }

  // Email
  if ((channel === 'email' || channel === 'both') && client.email) {
    if (resendClient) {
      try {
        await resendClient.emails.send({
          from: `${businessName} <bookings@joinglowup.org>`,
          replyTo: businessEmail || undefined,
          to: [client.email as string],
          subject: subject || `${businessName} — We're thinking of you! ✨`,
          html: promoEmailHtml({ businessName, message, ctaUrl, ctaText, logoUrl }),
        })
      } catch (err) {
        console.error(`Email send failed for ${client.email}:`, err)
      }
    } else {
      console.log(`[DRY RUN] Email to ${client.email}: ${message}`)
    }
  }
}
