import { NextResponse } from 'next/server'
import { rateLimited, clientIp, TOO_MANY } from '@/lib/rate-limit'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@supabase/supabase-js'
import { timezoneFromAddress, DEFAULT_TZ } from '@/lib/tz'
import { toE164 } from '@/lib/utils'
import { resolveTenantTz, resolveSpecialInstructions, resolveOwnerCopyEmail, sendOwnerCopy, ownerCc, appendInstructionsToSms, buildReminderRows, insertReminderRows, resolveBookingBufferMinutes, padBookedSlot, resolveCancellationPolicy } from '@/lib/notifications'
import { consentLinkFromManage } from '@/lib/consent-shared'
import { sendSms, smsProvider, smsConfigFromSettings } from '@/lib/sms'
import { bookingConfirmationHtml, promoEmailHtml, googleCalendarUrl } from '@/lib/email-templates'

// Public API — no auth required. Used by the /book/[slug] public booking page.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[public-booking] MISSING ENV: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
}
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Fetch public business info by slug
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
  }

  // Get tenant
  const { data: tenant, error: tErr } = await svc
    .from('tenants')
    .select('id, name, slug, phone, logo_url, address, timezone, settings')
    .eq('slug', slug)
    .single()

  if (tErr || !tenant) {
    console.error('[public-booking] tenant lookup failed', { slug, error: tErr?.message, code: tErr?.code })
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // Lightweight mode: the booking page re-checks availability at step 2 and
  // only needs fresh bookedSlots — skip the services/staff queries and payload.
  if (searchParams.get('only') === 'slots') {
    const tenantSettingsLite = (tenant.settings || {}) as Record<string, unknown>
    const bookingLite = (tenantSettingsLite.booking || {}) as Record<string, string>
    const lookAhead = parseInt(bookingLite.advanceBookingDays || '30', 10) || 30
    const bufferLite = resolveBookingBufferMinutes(tenant)
    const nowLite = new Date()
    const { data: aptsLite } = await svc
      .from('appointments')
      .select('staff_id, start_time, end_time')
      .eq('tenant_id', tenant.id)
      .gt('end_time', nowLite.toISOString())
      .lt('start_time', new Date(nowLite.getTime() + lookAhead * 24 * 60 * 60 * 1000).toISOString())
      .in('status', ['pending', 'confirmed', 'blocked'])
    return NextResponse.json({
      bookedSlots: (aptsLite || []).map(a => ({
        staff_id: a.staff_id,
        ...padBookedSlot(a.start_time, a.end_time, bufferLite),
      })),
    })
  }

  // Read advance booking limit from tenant settings (default 30 days)
  const tenantSettings = (tenant.settings || {}) as Record<string, unknown>
  const bookingConfig = (tenantSettings.booking || {}) as Record<string, string>
  const advanceBookingDays = parseInt(bookingConfig.advanceBookingDays || '30', 10) || 30

  // Existing appointments for availability: end_time > now (not start_time >=
  // now) so an in-progress 2hr appointment still blocks its remaining slots.
  const now = new Date()
  const futureLimit = new Date(now.getTime() + advanceBookingDays * 24 * 60 * 60 * 1000)

  // Three independent reads; this page is now server-rendered, so each one
  // run in series was time added to every client's first paint.
  const [{ data: services }, { data: staff }, { data: appointments }] = await Promise.all([
    svc
      .from('services')
      .select('id, name, category, description, duration_minutes, price, sort_order, image_url')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    svc
      .from('staff')
      .select('id, name, role, specialties, schedule')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .neq('name', 'Admin')
      .order('name'),
    svc
      .from('appointments')
      .select('staff_id, start_time, end_time, status')
      .eq('tenant_id', tenant.id)
      .gt('end_time', now.toISOString())
      .lt('start_time', futureLimit.toISOString())
      .in('status', ['pending', 'confirmed', 'blocked']),
  ])

  return NextResponse.json({
    business: {
      name: tenant.name,
      slug: tenant.slug,
      phone: tenant.phone,
      logo_url: tenant.logo_url,
      address: tenant.address,
      timezone: tenant.timezone || timezoneFromAddress(tenant.address) || DEFAULT_TZ,
      hours: tenantSettings.business_hours || null,
      advanceBookingDays,
      closedHolidays: (tenantSettings.closed_holidays || []) as string[],
      customClosedDates: (tenantSettings.custom_closed_dates || []) as { date: string; label: string }[],
      chatEnabled: ((tenantSettings.bot_config as { enabled?: boolean } | undefined)?.enabled) !== false,
      chatGreeting: (tenantSettings.bot_config as { greeting?: string } | undefined)?.greeting || null,
      // The salon's own accent on its booking page (Settings → Booking Link)
      brand_color: typeof tenantSettings.brand_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(tenantSettings.brand_color) ? tenantSettings.brand_color : null,
      // Shown before Confirm so the client isn't surprised by it later
      cancellationCutoffHours: resolveCancellationPolicy(tenant).cutoffHours,
      // Confirmation screen offers the consent form link when the salon uses one
      consentEnabled: (tenantSettings.consent_form as { enabled?: boolean } | undefined)?.enabled === true,
    },
    services: services || [],
    staff: (staff || []).map(s => {
      const sched = (s.schedule || {}) as Record<string, unknown>
      const service_durations = (sched.service_durations || {}) as Record<string, number>
      return {
        id: s.id,
        name: s.name,
        specialties: s.specialties,
        schedule: s.schedule,
        service_durations,
      }
    }),
    // Padded by the salon's turnaround buffer so the picker greys out the time
    // either side of a booking, not just the booking itself.
    bookedSlots: (appointments || []).map(a => ({
      staff_id: a.staff_id,
      ...padBookedSlot(a.start_time, a.end_time, resolveBookingBufferMinutes(tenant)),
    })),
  })
}

// POST: Create a booking (public — no auth)
// Supports both single-service (legacy) and multi-service (batch) mode.
export async function POST(request: Request) {
  // Each booking creates a client row and texts + emails the owner.
  if (rateLimited(`book:${clientIp(request)}`, 12, 10 * 60 * 1000)) {
    return NextResponse.json(TOO_MANY, { status: 429 })
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { slug, staff_id, start_time, client_name, client_email, client_phone, notes, client_birthday } = body
  // SMS consent from the booking form's checkbox. Default true for any legacy
  // caller that doesn't send the field; false only when explicitly unchecked.
  const smsConsent = body.sms_consent !== false

  // Build the services array: either from new batch format or legacy single-service
  let serviceItems: { service_id: string; staff_id?: string | null; duration_minutes: number }[]
  if (body.services && Array.isArray(body.services) && body.services.length > 0) {
    serviceItems = body.services
  } else if (body.service_id) {
    serviceItems = [{ service_id: body.service_id, staff_id: body.staff_id || null, duration_minutes: body.duration_minutes || 60 }]
  } else {
    return NextResponse.json({ error: 'Missing service(s)' }, { status: 400 })
  }

  if (!slug || !start_time || !client_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Resolve tenant (include name, phone, address, timezone, settings for notifications)
  const { data: tenant } = await svc
    .from('tenants')
    .select('id, name, email, phone, address, timezone, logo_url, settings')
    .eq('slug', slug)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // ── Resolve the requested services and staff INSIDE this salon ──
  // The ids come straight off an unauthenticated body. Looking them up without
  // the tenant filter let anyone book at salon A with salon B's technician:
  // the row landed in A's calendar carrying B's staff_id, and the double-booking
  // constraint (which has no tenant column) then blocked B's technician for
  // B's real clients. Anything not found here is refused.
  const overallStart = new Date(start_time)
  if (isNaN(overallStart.getTime())) {
    return NextResponse.json({ error: 'Invalid start time' }, { status: 400 })
  }
  // Fall back to top-level staff_id for legacy single-service requests
  const globalStaffId = body.staff_id || null
  const requestedServiceIds = [...new Set(serviceItems.map(i => i.service_id).filter(Boolean))]
  const requestedStaffIds = [...new Set(
    serviceItems.map(i => i.staff_id || globalStaffId).filter(Boolean)
  )] as string[]

  const { data: serviceRows } = await svc
    .from('services')
    .select('id, name, price, duration_minutes')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .in('id', requestedServiceIds)
  const serviceMap: Record<string, { name: string; price: number; duration_minutes: number | null }> = {}
  for (const sr of serviceRows || []) {
    serviceMap[sr.id] = { name: sr.name, price: sr.price, duration_minutes: sr.duration_minutes }
  }
  if (requestedServiceIds.length === 0 || requestedServiceIds.some(id => !serviceMap[id])) {
    return NextResponse.json({ error: 'Service not available' }, { status: 400 })
  }

  const staffNameMap: Record<string, string> = {}
  if (requestedStaffIds.length > 0) {
    const { data: staffRows } = await svc
      .from('staff')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .in('id', requestedStaffIds)
    for (const sr of staffRows || []) staffNameMap[sr.id] = sr.name
    if (requestedStaffIds.some(id => !staffNameMap[id])) {
      return NextResponse.json({ error: 'Staff member not available' }, { status: 400 })
    }
  }

  // ── Compute back-to-back time windows (with per-service staff) ──
  // The picker sends the duration it showed (it may apply a per-staff
  // override), so accept it within sane bounds and otherwise use the service's.
  const windows: { service_id: string; staff_id: string | null; start: Date; end: Date }[] = []
  let cursor = overallStart.getTime()
  for (const item of serviceItems) {
    const sent = Number(item.duration_minutes)
    const minutes = Number.isInteger(sent) && sent >= 5 && sent <= 600
      ? sent
      : (serviceMap[item.service_id].duration_minutes || 60)
    const s = new Date(cursor)
    const e = new Date(cursor + minutes * 60 * 1000)
    windows.push({ service_id: item.service_id, staff_id: item.staff_id || globalStaffId, start: s, end: e })
    cursor = e.getTime()
  }
  const overallEnd = new Date(cursor)

  // ── "Any Available": assign a concrete free staff member ──
  // Null-staff appointments bypass BOTH the conflict pre-check below and the
  // DB exclusion constraint (it only covers staff_id IS NOT NULL), so several
  // customers picking "Any Available" for the same slot all used to succeed.
  // Resolving to a real staff member here puts every booking under the
  // constraint's protection.
  // The salon's turnaround buffer widens every window we test for conflicts, so
  // the server refuses the same back-to-back slots the picker greyed out.
  // Padding the REQUESTED window (rather than each existing appointment) keeps
  // the two sides symmetric without double-counting the gap.
  const bufferMs = resolveBookingBufferMinutes(tenant) * 60 * 1000
  const padStart = (d: Date) => new Date(d.getTime() - bufferMs)
  const padEnd = (d: Date) => new Date(d.getTime() + bufferMs)

  if (windows.some(w => !w.staff_id)) {
    const { data: candidates } = await svc
      .from('staff')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .neq('name', 'Admin')

    const { data: busy } = await svc
      .from('appointments')
      .select('staff_id, start_time, end_time')
      .eq('tenant_id', tenant.id)
      .in('status', ['pending', 'confirmed', 'blocked'])
      .lt('start_time', padEnd(overallEnd).toISOString())
      .gt('end_time', padStart(overallStart).toISOString())

    for (const w of windows) {
      if (w.staff_id) continue
      const free = (candidates || []).find(c =>
        // no existing appointment overlapping this window (plus buffer)...
        !(busy || []).some(b => b.staff_id === c.id &&
          new Date(b.start_time) < padEnd(w.end) && new Date(b.end_time) > padStart(w.start)) &&
        // ...and not already claimed by another window of this same booking
        !windows.some(o => o !== w && o.staff_id === c.id &&
          o.start < w.end && o.end > w.start)
      )
      if (!free) {
        return NextResponse.json(
          { error: 'This time slot is no longer available. Please choose another time.' },
          { status: 409 }
        )
      }
      w.staff_id = free.id
    }
  }

  // ── Server-side double-booking prevention (per-staff conflict check) ──
  // Group windows by staff_id and check each staff's appointments
  const staffWindows = new Map<string, { start: Date; end: Date }[]>()
  for (const w of windows) {
    if (!w.staff_id) continue
    if (!staffWindows.has(w.staff_id)) staffWindows.set(w.staff_id, [])
    staffWindows.get(w.staff_id)!.push({ start: w.start, end: w.end })
  }
  for (const [sid, wins] of staffWindows) {
    // Find the overall window for this staff member
    const staffStart = wins.reduce((min, w) => w.start < min ? w.start : min, wins[0].start)
    const staffEnd = wins.reduce((max, w) => w.end > max ? w.end : max, wins[0].end)
    const { data: conflicts } = await svc
      .from('appointments')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('staff_id', sid)
      .in('status', ['pending', 'confirmed', 'blocked'])
      .lt('start_time', padEnd(staffEnd).toISOString())
      .gt('end_time', padStart(staffStart).toISOString())
      .limit(1)

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { error: 'This time slot is no longer available. Please choose another time.' },
        { status: 409 }
      )
    }
  }

  // Upsert client by email or phone
  let clientId: string | null = null
  const [firstName, ...lastParts] = client_name.trim().split(' ')
  const lastName = lastParts.join(' ') || null

  if (client_email) {
    const { data: existing } = await svc
      .from('clients')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('email', client_email)
      .single()

    if (existing) {
      clientId = existing.id
    }
  }

  if (!clientId && client_phone) {
    const { data: existing } = await svc
      .from('clients')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('phone', client_phone)
      .single()

    if (existing) {
      clientId = existing.id
    }
  }

  if (!clientId) {
    const { data: newClient, error: newClientErr } = await svc
      .from('clients')
      .insert({
        tenant_id: tenant.id,
        first_name: firstName,
        last_name: lastName,
        email: client_email || null,
        phone: client_phone || null,
        birthday: client_birthday || null,
        status: 'new',
        sms_opt_out: !smsConsent,
      })
      .select('id')
      .single()

    // Never book an anonymous appointment. If the client row can't be created we
    // have no name or contact details, so the salon would get an unusable slot
    // and the customer would think they were booked.
    if (newClientErr || !newClient) {
      console.error('[public-booking] Failed to create client:', newClientErr)
      return NextResponse.json(
        { error: 'We could not save your details. Please try again or call the salon.' },
        { status: 500 }
      )
    }

    clientId = newClient.id
  } else {
    // Returning client: refresh birthday and their SMS consent choice. The
    // consent checkbox used to be silently discarded for existing clients.
    const updates: Record<string, unknown> = {}
    if (client_birthday) updates.birthday = client_birthday
    // A public form may only ever OPT a client OUT. Clearing opt-out from here
    // let anyone who knew a client's phone re-subscribe them to texts.
    if (body.sms_consent === false) updates.sms_opt_out = true
    if (Object.keys(updates).length > 0) {
      await svc.from('clients').update(updates).eq('id', clientId)
    }
  }

  // ── Create appointments (one per service, back-to-back) ──
  // "Any Available" may have assigned staff the request didn't name; pick up
  // their names for the notifications. These ids came from our own tenant-
  // scoped candidate query above, so no further validation is needed.
  const assignedStaffIds = [...new Set(windows.map(w => w.staff_id).filter(Boolean))] as string[]
  const unnamed = assignedStaffIds.filter(id => !staffNameMap[id])
  if (unnamed.length > 0) {
    const { data: staffRows } = await svc
      .from('staff')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .in('id', unnamed)
    for (const sr of staffRows || []) staffNameMap[sr.id] = sr.name
  }

  // Insert all appointments (with per-service staff_id)
  const appointmentRows = windows.map(w => ({
    tenant_id: tenant.id,
    client_id: clientId,
    service_id: w.service_id,
    staff_id: w.staff_id || null,
    start_time: w.start.toISOString(),
    end_time: w.end.toISOString(),
    status: 'confirmed',
    total_price: serviceMap[w.service_id]?.price || 0,
    notes: notes || null,
  }))

  const { data: appointments, error } = await svc
    .from('appointments')
    .insert(appointmentRows)
    .select('id, start_time, end_time, manage_token')

  // 23P01 = the appointments_no_double_book exclusion constraint. The overlap
  // pre-check above is a TOCTOU — several round trips separate it from this
  // INSERT, so two customers can both pass it and race here. The constraint is
  // what actually decides. Answer exactly as the pre-check does: the client
  // already handles 409 by refreshing availability and returning the customer
  // to the time picker, so losing the race looks like a normal "slot taken".
  if (error && (error as { code?: string }).code === '23P01') {
    return NextResponse.json(
      { error: 'This time slot is no longer available. Please choose another time.' },
      { status: 409 }
    )
  }

  if (error || !appointments || appointments.length === 0) {
    console.error('[public-booking] Failed to create appointments:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  // ── Send instant booking confirmation notifications ──
  // Use the first appointment for notification timing, but list all services
  const allServiceNames = windows.map(w => serviceMap[w.service_id]?.name || 'Service').join(', ')
  const allStaffNames = [...new Set(windows.map(w => w.staff_id ? staffNameMap[w.staff_id] : null).filter(Boolean))].join(', ')
  // Fire-and-forget: send notifications in the background so the client sees confirmation instantly
  // Use waitUntil so Vercel keeps the function alive until notifications complete
  const notificationPromise = sendBookingConfirmations({
    tenant,
    appointment: appointments[0],
    serviceName: allServiceNames,
    staffName: allStaffNames,
    clientName: client_name,
    clientEmail: client_email || null,
    clientPhone: client_phone || null,
    clientId,
    start: overallStart,
    end: overallEnd,
    smsConsent,
  }).catch(err => console.error('[public-booking] notification error:', err))

  // ── Create reminders for ALL appointments ──
  if (clientId) {
    // Only schedule SMS reminders when the client opted in; email always.
    const smsOk = smsConsent && !!client_phone
    const reminderRows = appointments.flatMap(apt => buildReminderRows({
      tenantId: tenant.id,
      appointmentId: apt.id,
      clientId,
      clientPhone: smsOk ? client_phone : null,
      clientEmail: client_email || null,
    }))
    const created = await insertReminderRows(svc, reminderRows, 'public-booking')
    if (created > 0) {
      console.log(`[public-booking] ✅ Created ${created} reminder(s) for ${appointments.length} appointment(s)`)
    }
  }

  // Keep Vercel function alive until notifications finish
  try { waitUntil(notificationPromise) } catch { /* local dev — no waitUntil */ }

  return NextResponse.json({ success: true, appointments })
}

// PATCH: Update client birthday after booking (post-confirmation prompt)
export async function PATCH(request: Request) {
  const body = await request.json()
  const { slug, client_email, client_phone, birthday } = body

  if (!slug || !birthday || (!client_email && !client_phone)) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: tenant } = await svc
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // Find the client
  // Only fill in a birthday that isn't set: this is unauthenticated, keyed by
  // phone or email, and must never overwrite what the salon has on file.
  let query = svc.from('clients').update({ birthday }).eq('tenant_id', tenant.id).is('birthday', null)

  if (client_email) {
    query = query.eq('email', client_email)
  } else {
    query = query.eq('phone', client_phone)
  }

  await query

  return NextResponse.json({ success: true })
}

// ─── Instant Booking Confirmation Notifications ───
// Sends SMS + Email to the client AND the business owner right after booking.
// Also creates 24h reminder rows for the existing cron to pick up.
async function sendBookingConfirmations(opts: {
  tenant: { id: string; name: string; email: string | null; phone: string | null; address: string | null; timezone?: string | null; logo_url?: string | null; settings: Record<string, unknown> | null }
  appointment: { id: string; start_time: string; end_time: string; manage_token?: string }
  serviceName: string
  staffName: string
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  clientId: string | null
  start: Date
  end: Date
  smsConsent: boolean
}) {
  const { tenant, appointment, serviceName, staffName, clientName, clientEmail, clientPhone, clientId, start } = opts

  // Format greeting: "Dear James D." instead of full name
  function greetingName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/)
    if (parts.length <= 1) return parts[0] || 'there'
    return `${parts[0]} ${parts[parts.length - 1][0]}.`
  }
  const greeting = greetingName(clientName)

  // Build manage link for self-service cancel/reschedule
  // IMPORTANT: Use production URL, NOT VERCEL_URL (which gives deployment-specific URLs
  // that require Vercel Authentication and block clients from accessing the page)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
    || 'https://glowup-jade.vercel.app'
  const manageLink = appointment.manage_token ? `${baseUrl}/manage/${appointment.manage_token}` : ''
  const consentLink = consentLinkFromManage(manageLink, tenant.settings as Record<string, unknown> | null)

  // Fallback: if tenant doesn't have email/phone, look up the owner staff member
  let ownerFallbackEmail = ''
  let ownerFallbackPhone = ''
  if (!tenant.email || !tenant.phone) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const fallbackSvc = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: ownerStaff } = await fallbackSvc
        .from('staff')
        .select('email, phone')
        .eq('tenant_id', tenant.id)
        .eq('role', 'owner')
        .single()
      if (ownerStaff) {
        ownerFallbackEmail = ownerStaff.email || ''
        ownerFallbackPhone = ownerStaff.phone || ''
      }
    } catch (err) {
      console.error('[public-booking] Owner fallback lookup failed:', err)
    }
  }

  const businessName = tenant.name || 'our salon'
  const businessAddress = (tenant.address as string) || ''
  const businessPhone = tenant.phone || ownerFallbackPhone
  const businessEmail = tenant.email || ownerFallbackEmail

  // Determine tenant timezone for display — the tenants.timezone COLUMN is
  // the source of truth (Settings saves it there); the settings blob is legacy.
  const tenantSettings = (tenant.settings || {}) as Record<string, unknown>
  const tz = resolveTenantTz(tenant)
  const specialInstructions = resolveSpecialInstructions(tenant)

  // Format date/time in tenant timezone
  let dateStr: string
  let timeStr: string
  try {
    dateStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
    timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  } catch {
    // Fallback if timezone is invalid
    dateStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  // The salon's own phone when it has one, else the platform provider
  const tenantSms = smsConfigFromSettings(tenant.settings)
  const smsReady = smsProvider(tenantSms) !== null
  const hasResend = !!process.env.RESEND_API_KEY

  console.log(`[public-booking] Notification channels: SMS=${smsProvider(tenantSms) || 'none'}, Resend=${hasResend} | Client: phone=${clientPhone || 'NONE'}, email=${clientEmail || 'NONE'} | Owner: phone=${businessPhone || 'NONE'}, email=${businessEmail || 'NONE'}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resendClient: any = null
  if (hasResend) {
    const { Resend } = await import('resend')
    resendClient = new Resend(process.env.RESEND_API_KEY!)
  }

  // ── 1. SMS to client (only if they opted in) ──
  if (clientPhone && opts.smsConsent) {
    const calTitle = `${serviceName} — ${businessName}`
    const calLocation = businessAddress ? `${businessName}, ${businessAddress}` : businessName
    const gcalLink = googleCalendarUrl({ title: calTitle, startISO: start.toISOString(), endISO: opts.end.toISOString(), location: calLocation })

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
      consentLink ? `📝 Please complete your consent form before your visit: ${consentLink}` : '',
    ].filter(Boolean).join('\n')

    const clientE164 = toE164(clientPhone)
    if (smsReady && clientE164) {
      try {
        const ok = await sendSms(clientE164, appendInstructionsToSms(clientSms, specialInstructions), tenantSms)
        if (ok) console.log(`[public-booking] ✅ Confirmation SMS sent to client ${clientE164}`)
      } catch (err: unknown) {
        const e = err as { message?: string }
        console.error(`[public-booking] SMS to client FAILED: ${e.message}`)
      }
    } else if (!clientE164) {
      console.warn(`[public-booking] ⚠️ Could not normalize client phone: "${clientPhone}"`)
    } else {
      console.log(`[DRY RUN] Client SMS to ${clientPhone}: ${clientSms}`)
    }
  }

  // ── 2. Email to client (and the owner's copy, if they opted in) ──
  const ownerCopyEmail = resolveOwnerCopyEmail(tenant, businessEmail)
  if (clientEmail || ownerCopyEmail) {
    const clientEmailHtml = bookingConfirmationHtml({
      greeting,
      serviceName,
      dateStr,
      timeStr,
      staffName,
      businessName,
      businessAddress,
      businessPhone,
      manageLink,
      consentLink,
      startISO: start.toISOString(),
      endISO: opts.end.toISOString(),
      logoUrl: tenant.logo_url || null,
      specialInstructions: specialInstructions.text,
    })

    const clientSubject = `✅ Booking Confirmed — ${serviceName} on ${dateStr}`
    if (resendClient && clientEmail) {
      try {
        await resendClient.emails.send({
          from: `${businessName} <bookings@joinglowup.org>`,
          replyTo: businessEmail || undefined,
          to: [clientEmail],
          cc: ownerCc(ownerCopyEmail, clientEmail),
          subject: clientSubject,
          html: clientEmailHtml,
        })
        console.log(`[public-booking] ✅ Confirmation email sent to client ${clientEmail}`)
      } catch (err) {
        console.error(`[public-booking] Email to client failed:`, err)
      }
    } else if (clientEmail) {
      console.log(`[DRY RUN] Client email to ${clientEmail}`)
    }
    // No client email → nothing to CC onto, so the owner gets a standalone copy.
    if (resendClient && ownerCopyEmail && !clientEmail) {
      await sendOwnerCopy(ownerCopyEmail, clientSubject, clientEmailHtml, clientName, clientEmail)
    }
  }

  // ── 3. SMS to business owner ──
  if (businessPhone) {
    const ownerSms = [
      `🆕 New Online Booking!`,
      ``,
      `Client: ${clientName}${clientPhone ? ` (${clientPhone})` : ''}`,
      `📋 ${serviceName}`,
      `📅 ${dateStr} at ${timeStr}`,
      staffName ? `💇 Staff: ${staffName}` : '',
    ].filter(Boolean).join('\n')

    const ownerE164 = toE164(businessPhone)
    if (smsReady && ownerE164) {
      try {
        const ok = await sendSms(ownerE164, ownerSms, tenantSms)
        if (ok) console.log(`[public-booking] ✅ Owner SMS sent to ${ownerE164}`)
      } catch (err: unknown) {
        const e = err as { message?: string }
        console.error(`[public-booking] SMS to owner FAILED: ${e.message}`)
      }
    } else if (!ownerE164) {
      console.warn(`[public-booking] ⚠️ Could not normalize owner phone: "${businessPhone}"`)
    } else {
      console.log(`[DRY RUN] Owner SMS to ${businessPhone}: ${ownerSms}`)
    }
  }

  // ── 4. Email to business owner ──
  // Use tenant email column, or fall back to settings
  // Skipped when the owner already got the confirmation itself (CC or copy) —
  // otherwise every booking lands in their inbox twice.
  const ownerEmail = businessEmail || (tenantSettings.owner_email as string) || (tenantSettings.email as string) || null
  if (ownerEmail && !ownerCopyEmail) {
    const ownerEmailBody = [
      `New online booking received!`,
      ``,
      `Client: ${clientName}`,
      `Phone: ${clientPhone || 'Not provided'}`,
      `Email: ${clientEmail || 'Not provided'}`,
      `Service: ${serviceName}`,
      `Date: ${dateStr} at ${timeStr}`,
      staffName ? `Staff: ${staffName}` : '',
      ``,
      `View your calendar in the GlowUp dashboard to manage this appointment.`,
    ].filter(Boolean).join('\n')

    if (resendClient) {
      try {
        const dashboardUrl = `${baseUrl}/dashboard/calendar`
        await resendClient.emails.send({
          from: `GlowUp <bookings@joinglowup.org>`,
          // Reply goes to the CLIENT — this mail tells the owner someone just
          // booked, so Reply should reach that person. Using businessEmail here
          // pointed the owner at their own inbox.
          replyTo: clientEmail || undefined,
          to: [ownerEmail],
          subject: `🆕 New Booking: ${clientName} — ${serviceName} on ${dateStr}`,
          html: promoEmailHtml({ businessName, message: ownerEmailBody, ctaUrl: dashboardUrl, ctaText: 'View Calendar', logoUrl: tenant.logo_url || null }),
        })
        console.log(`[public-booking] ✅ Owner email sent to ${ownerEmail}`)
      } catch (err) {
        console.error(`[public-booking] Email to owner failed:`, err)
      }
    } else {
      console.log(`[DRY RUN] Owner email to ${ownerEmail}: ${ownerEmailBody}`)
    }
  }
}
