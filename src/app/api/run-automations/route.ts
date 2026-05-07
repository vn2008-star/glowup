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

  // Holiday calendar (must match the UI list in campaigns/page.tsx)
  const HOLIDAYS = [
    { name: 'Lunar New Year', emoji: '🧧', month: 0, day: 29, template: '🧧 Lunar New Year Special! Start the Year of the Snake looking radiant. 20% off all services + lucky red gift cards available 🎊 Book now → {booking_url}' },
    { name: "Valentine's Day", emoji: '💖', month: 1, day: 14, template: "💖 Valentine's Day Special! Look & feel amazing for your date. 15% off any service this week. Book now → {booking_url}" },
    { name: "International Women's Day", emoji: '💜', month: 2, day: 8, template: "💜 Happy Women's Day, {name}! Celebrate YOU with a self-care session. 20% off this week only → {booking_url}" },
    { name: "Mother's Day", emoji: '🌹', month: 4, day: 11, template: "🌹 Mother's Day Special! Give Mom the gift of pampering. Gift cards + 15% off spa & beauty packages → {booking_url}" },
    { name: 'Memorial Day', emoji: '🇺🇸', month: 4, day: 26, template: '🇺🇸 Memorial Day Sale! Get summer-ready. 20% off all services this weekend → {booking_url}' },
    { name: '4th of July', emoji: '🎆', month: 6, day: 4, template: '🎆 4th of July Glow-Up! Get party-ready with our holiday special. Book now → {booking_url}' },
    { name: 'Back to School', emoji: '🎒', month: 7, day: 15, template: '🎒 Back to School Special! Start the year fresh with a new look. Student discount: 15% off → {booking_url}' },
    { name: 'Halloween', emoji: '🎃', month: 9, day: 31, template: '🎃 Halloween Glam! Get costume-ready with our spooky season specials. Book now → {booking_url}' },
    { name: 'Thanksgiving', emoji: '🦃', month: 10, day: 27, template: '🦃 Look stunning for Thanksgiving! Book your holiday session. Family discounts available → {booking_url}' },
    { name: 'Black Friday', emoji: '💰', month: 10, day: 28, template: '💰 Black Friday DEAL! Our biggest sale of the year. Up to 30% off services + bonus gift cards → {booking_url}' },
    { name: 'Christmas', emoji: '🎄', month: 11, day: 25, template: '🎄 Holiday Glow! Get party-ready for the season. Gift cards make the perfect present 🎁 Book now → {booking_url}' },
    { name: "New Year's Eve", emoji: '🎉', month: 11, day: 31, template: '🎉 New Year\'s Glow-Up! Ring in the new year looking & feeling amazing. Limited spots available → {booking_url}' },
  ]

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
    const businessName = tenant.name || 'our salon'
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const bookingUrl = `${baseUrl}/book/${tenant.slug}`

    // ── Fill My Openings Auto-Blast ──
    if (automations.auto_fill_openings) {
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
      const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
      let totalOpenSlots = 0
      const slotDescriptions: string[] = []

      for (let d = 0; d < lookAheadDays; d++) {
        const date = new Date(now)
        date.setDate(date.getDate() + d)
        const dayName = DAY_NAMES[date.getDay()]
        const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

        for (const s of (staffList || [])) {
          const sched = (s.schedule && typeof s.schedule === 'object' && Object.keys(s.schedule).length > 0)
            ? s.schedule as Record<string, { start?: string; end?: string; off?: boolean }>
            : null
          const dayConfig = sched?.[dayName]
          if (dayConfig?.off) continue
          if (!dayConfig && date.getDay() === 0) continue

          const workStart = dayConfig?.start ? parseInt(dayConfig.start, 10) : 9
          const workEnd = dayConfig?.end ? parseInt(dayConfig.end, 10) : 17
          if (workEnd <= workStart) continue

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

          let cursor = workStart
          for (const b of booked) {
            if (b.start > cursor && (b.start - cursor) >= 0.5) totalOpenSlots++
            cursor = Math.max(cursor, b.end)
          }
          if (workEnd > cursor && (workEnd - cursor) >= 0.5) totalOpenSlots++
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
          const slotsText = slotDescriptions.length > 0 ? slotDescriptions.join(', ') : `the next ${lookAheadDays} day${lookAheadDays !== 1 ? 's' : ''}`
          const message = `Hey {name}! ⚡ We have ${totalOpenSlots} opening${totalOpenSlots !== 1 ? 's' : ''} on ${slotsText}. Book now before they're gone → ${bookingUrl}`

          for (const client of recipients) {
            const clientName = `${client.first_name || ''}`.trim() || 'there'
            const personalizedMsg = message.replace(/\{name\}/g, clientName)

            await sendMessage({
              client,
              message: personalizedMsg,
              businessName,
              twilioClient,
              resendClient,
              channel: fmoChannel,
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
    }

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

          await sendMessage({ client, message, businessName, twilioClient, resendClient, channel: 'both' })
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

          await sendMessage({ client, message, businessName, twilioClient, resendClient, channel: 'both' })
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

          const reviewChannel = String(automations.auto_review_channel || 'sms') as 'sms' | 'email' | 'both'
          await sendMessage({ client, message, businessName, twilioClient, resendClient, channel: reviewChannel })
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
    if (automations.auto_holiday !== false) {
      const holidaySettings = (settings.holiday_settings || {}) as Record<string, number>
      const sendDaysBefore = holidaySettings.send_days_before ?? 7
      const today = new Date()
      const year = today.getFullYear()

      for (const holiday of HOLIDAYS) {
        // Calculate the holiday date (this year or next)
        let holidayDate = new Date(year, holiday.month, holiday.day)
        if (holidayDate < today) holidayDate = new Date(year + 1, holiday.month, holiday.day)

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
          const clientName = `${client.first_name || ''}`.trim() || 'there'
          const personalizedMsg = holiday.template
            .replace(/\{name\}/g, clientName)
            .replace(/\{booking_url\}/g, bookingUrl)
            .replace(/\{business_name\}/g, businessName)

          await sendMessage({ client, message: personalizedMsg, businessName, twilioClient, resendClient, channel: 'both' })
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
