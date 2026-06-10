import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timezoneFromAddress, DEFAULT_TZ } from '@/lib/tz'

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

  // Get active services
  const { data: services } = await svc
    .from('services')
    .select('id, name, category, description, duration_minutes, price, sort_order, image_url')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  // Get active staff (include schedule for custom service durations)
  const { data: staff } = await svc
    .from('staff')
    .select('id, name, role, specialties, schedule')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .neq('name', 'Admin')
    .order('name')

  // Read advance booking limit from tenant settings (default 30 days)
  const tenantSettings = (tenant.settings || {}) as Record<string, unknown>
  const bookingConfig = (tenantSettings.booking || {}) as Record<string, string>
  const advanceBookingDays = parseInt(bookingConfig.advanceBookingDays || '30', 10) || 30

  // Get existing appointments for availability checking
  // Use end_time > now (not start_time >= now) to include in-progress appointments
  // e.g., a 2hr appointment that started 30min ago still blocks the next 90min of slots
  const now = new Date()
  const futureLimit = new Date(now.getTime() + advanceBookingDays * 24 * 60 * 60 * 1000)
  const { data: appointments } = await svc
    .from('appointments')
    .select('staff_id, start_time, end_time, status')
    .eq('tenant_id', tenant.id)
    .gt('end_time', now.toISOString())
    .lt('start_time', futureLimit.toISOString())
    .in('status', ['pending', 'confirmed'])

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
    bookedSlots: (appointments || []).map(a => ({
      staff_id: a.staff_id,
      start: a.start_time,
      end: a.end_time,
    })),
  })
}

// POST: Create a booking (public — no auth)
export async function POST(request: Request) {
  const body = await request.json()
  const { slug, service_id, staff_id, start_time, duration_minutes, client_name, client_email, client_phone, notes, client_birthday } = body

  if (!slug || !service_id || !start_time || !client_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Resolve tenant (include name, phone, address, settings for notifications)
  const { data: tenant } = await svc
    .from('tenants')
    .select('id, name, phone, address, settings')
    .eq('slug', slug)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // ── Server-side double-booking prevention ──
  const start = new Date(start_time)
  const end = new Date(start.getTime() + (duration_minutes || 60) * 60 * 1000)

  if (staff_id) {
    const { data: conflicts } = await svc
      .from('appointments')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('staff_id', staff_id)
      .in('status', ['pending', 'confirmed'])
      .lt('start_time', end.toISOString())
      .gt('end_time', start.toISOString())
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
    const { data: newClient } = await svc
      .from('clients')
      .insert({
        tenant_id: tenant.id,
        first_name: firstName,
        last_name: lastName,
        email: client_email || null,
        phone: client_phone || null,
        birthday: client_birthday || null,
        status: 'new',
      })
      .select('id')
      .single()

    clientId = newClient?.id || null
  } else if (client_birthday) {
    // Update existing client's birthday if provided
    await svc
      .from('clients')
      .update({ birthday: client_birthday })
      .eq('id', clientId)
  }

  // Create the appointment
  // Get service name + price
  const { data: service } = await svc
    .from('services')
    .select('name, price')
    .eq('id', service_id)
    .single()

  // Get staff name if assigned
  let staffName = ''
  if (staff_id) {
    const { data: staffRow } = await svc
      .from('staff')
      .select('name')
      .eq('id', staff_id)
      .single()
    staffName = staffRow?.name || ''
  }

  const { data: appointment, error } = await svc
    .from('appointments')
    .insert({
      tenant_id: tenant.id,
      client_id: clientId,
      service_id,
      staff_id: staff_id || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'confirmed',
      total_price: service?.price || 0,
      notes: notes || null,
    })
    .select('id, start_time, end_time')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  // ── Send instant booking confirmation notifications ──
  // Fire-and-forget: don't block the response on notification delivery
  sendBookingConfirmations({
    tenant,
    appointment,
    serviceName: service?.name || 'your appointment',
    staffName,
    clientName: client_name,
    clientEmail: client_email || null,
    clientPhone: client_phone || null,
    clientId,
    start,
    end,
  }).catch(err => console.error('[public-booking] notification error:', err))

  return NextResponse.json({ success: true, appointment })
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
  let query = svc.from('clients').update({ birthday }).eq('tenant_id', tenant.id)

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
  tenant: { id: string; name: string; phone: string | null; address: string | null; settings: Record<string, unknown> | null }
  appointment: { id: string; start_time: string; end_time: string }
  serviceName: string
  staffName: string
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  clientId: string | null
  start: Date
  end: Date
}) {
  const { tenant, appointment, serviceName, staffName, clientName, clientEmail, clientPhone, clientId, start } = opts

  const businessName = tenant.name || 'our salon'
  const businessAddress = (tenant.address as string) || ''
  const businessPhone = tenant.phone || ''

  // Determine tenant timezone for display
  const tenantSettings = (tenant.settings || {}) as Record<string, unknown>
  const tz = (tenantSettings.timezone as string) || 'America/Los_Angeles'

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

  // ── 1. SMS to client ──
  if (clientPhone) {
    const clientSms = [
      `✅ Booking Confirmed!`,
      ``,
      `Hi ${clientName}, your appointment is booked:`,
      `📋 ${serviceName}`,
      `📅 ${dateStr} at ${timeStr}`,
      staffName ? `💇 With: ${staffName}` : '',
      businessAddress ? `📍 ${businessName}, ${businessAddress}` : `📍 ${businessName}`,
      ``,
      `Need to change? Contact us at ${businessPhone || 'the salon'}.`,
    ].filter(Boolean).join('\n')

    if (twilioClient) {
      try {
        await twilioClient.messages.create({
          body: clientSms,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: clientPhone,
        })
        console.log(`[public-booking] ✅ Confirmation SMS sent to client ${clientPhone}`)
      } catch (err) {
        console.error(`[public-booking] SMS to client failed:`, err)
      }
    } else {
      console.log(`[DRY RUN] Client SMS to ${clientPhone}: ${clientSms}`)
    }
  }

  // ── 2. Email to client ──
  if (clientEmail) {
    const clientEmailBody = [
      `Hi ${clientName},`,
      ``,
      `Your appointment has been confirmed! Here are the details:`,
      ``,
      `📋 Service: ${serviceName}`,
      `📅 Date: ${dateStr}`,
      `🕐 Time: ${timeStr}`,
      staffName ? `💇 With: ${staffName}` : '',
      `📍 Location: ${businessName}${businessAddress ? `, ${businessAddress}` : ''}`,
      ``,
      `Need to reschedule or cancel? Reply to this email or contact us at ${businessPhone || 'the salon'}.`,
      ``,
      `See you soon!`,
      `— ${businessName}`,
    ].filter(Boolean).join('\n')

    if (resendClient) {
      try {
        await resendClient.emails.send({
          from: `${businessName} <onboarding@resend.dev>`,
          to: [clientEmail],
          subject: `✅ Booking Confirmed — ${serviceName} on ${dateStr}`,
          text: clientEmailBody,
        })
        console.log(`[public-booking] ✅ Confirmation email sent to client ${clientEmail}`)
      } catch (err) {
        console.error(`[public-booking] Email to client failed:`, err)
      }
    } else {
      console.log(`[DRY RUN] Client email to ${clientEmail}: ${clientEmailBody}`)
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

    if (twilioClient) {
      try {
        await twilioClient.messages.create({
          body: ownerSms,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: businessPhone,
        })
        console.log(`[public-booking] ✅ Owner SMS sent to ${businessPhone}`)
      } catch (err) {
        console.error(`[public-booking] SMS to owner failed:`, err)
      }
    } else {
      console.log(`[DRY RUN] Owner SMS to ${businessPhone}: ${ownerSms}`)
    }
  }

  // ── 4. Email to business owner ──
  // Use tenant email from settings if available, else skip
  const ownerEmail = (tenantSettings.owner_email as string) || (tenantSettings.email as string) || null
  if (ownerEmail) {
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
        await resendClient.emails.send({
          from: `GlowUp <onboarding@resend.dev>`,
          to: [ownerEmail],
          subject: `🆕 New Booking: ${clientName} — ${serviceName} on ${dateStr}`,
          text: ownerEmailBody,
        })
        console.log(`[public-booking] ✅ Owner email sent to ${ownerEmail}`)
      } catch (err) {
        console.error(`[public-booking] Email to owner failed:`, err)
      }
    } else {
      console.log(`[DRY RUN] Owner email to ${ownerEmail}: ${ownerEmailBody}`)
    }
  }

  // ── 5. Create 24h reminder rows for the existing reminder cron ──
  if (clientId && appointment?.id) {
    const reminderRows = []
    if (clientPhone) {
      reminderRows.push({
        tenant_id: tenant.id,
        appointment_id: appointment.id,
        client_id: clientId,
        type: '24h',
        channel: 'sms',
        status: 'pending',
      })
    }
    if (clientEmail) {
      reminderRows.push({
        tenant_id: tenant.id,
        appointment_id: appointment.id,
        client_id: clientId,
        type: '24h',
        channel: 'email',
        status: 'pending',
      })
    }
    if (reminderRows.length > 0) {
      const { error: reminderErr } = await svc.from('appointment_reminders').insert(reminderRows)
      if (reminderErr) {
        console.error('[public-booking] Failed to create reminders:', reminderErr)
      } else {
        console.log(`[public-booking] ✅ Created ${reminderRows.length} reminder(s) for appointment ${appointment.id}`)
      }
    }
  }
}
