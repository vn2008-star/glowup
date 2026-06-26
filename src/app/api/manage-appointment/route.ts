import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/utils'
import { rescheduleConfirmationHtml } from '@/lib/email-templates'

// Public API — token-based auth (no login required)
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Fetch appointment details by manage_token
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const { data: apt, error } = await svc
    .from('appointments')
    .select(`
      id, tenant_id, start_time, end_time, status, notes, manage_token, service_id, staff_id,
      services ( id, name, duration_minutes, price ),
      staff!staff_id ( id, name ),
      clients ( id, first_name, last_name, email, phone )
    `)
    .eq('manage_token', token)
    .single()

  if (error || !apt) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }

  // Get tenant info for display
  const { data: tenant } = await svc
    .from('tenants')
    .select('id, name, slug, phone, address, logo_url, timezone, settings')
    .eq('id', apt.tenant_id)
    .single()

  const service = apt.services as unknown as { id: string; name: string; duration_minutes: number; price: number } | null

  // Fetch the assigned staff member's full schedule for the reschedule calendar
  let staffSchedule: Record<string, unknown> | null = null
  if (apt.staff_id) {
    const { data: staffRow } = await svc
      .from('staff')
      .select('schedule')
      .eq('id', apt.staff_id)
      .single()
    staffSchedule = (staffRow?.schedule || null) as Record<string, unknown> | null
  }

  // Fetch the staff's existing booked appointments (next 30 days) for conflict display
  const now = new Date()
  const futureLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  let bookedSlots: { start: string; end: string }[] = []
  if (apt.staff_id) {
    const { data: existingApts } = await svc
      .from('appointments')
      .select('start_time, end_time')
      .eq('tenant_id', apt.tenant_id)
      .eq('staff_id', apt.staff_id)
      .neq('id', apt.id) // exclude the current appointment being rescheduled
      .in('status', ['pending', 'confirmed', 'blocked'])
      .gt('end_time', now.toISOString())
      .lt('start_time', futureLimit.toISOString())
    bookedSlots = (existingApts || []).map(a => ({ start: a.start_time, end: a.end_time }))
  }

  return NextResponse.json({
    appointment: {
      id: apt.id,
      start_time: apt.start_time,
      end_time: apt.end_time,
      status: apt.status,
      notes: apt.notes,
      service: service,
      staff: apt.staff,
      client: apt.clients,
    },
    business: tenant ? {
      name: tenant.name,
      slug: tenant.slug,
      phone: tenant.phone,
      address: tenant.address,
      logo_url: tenant.logo_url,
      timezone: tenant.timezone,
      hours: (tenant.settings as Record<string, unknown>)?.business_hours || null,
    } : null,
    staffSchedule,
    bookedSlots,
  })
}

// PATCH: Cancel or Reschedule appointment
export async function PATCH(request: Request) {
  const body = await request.json()
  const { token, action, new_start_time } = body

  if (!token || !action) {
    return NextResponse.json({ error: 'Missing token or action' }, { status: 400 })
  }

  // Look up appointment by token
  const { data: apt, error } = await svc
    .from('appointments')
    .select(`
      id, tenant_id, start_time, end_time, status, service_id, staff_id, client_id,
      services ( name, duration_minutes ),
      staff!staff_id ( name ),
      clients ( first_name, last_name, email, phone )
    `)
    .eq('manage_token', token)
    .single()

  if (error || !apt) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }

  // Can only modify future, non-cancelled appointments
  if (new Date(apt.start_time) < new Date()) {
    return NextResponse.json({ error: 'Cannot modify past appointments' }, { status: 400 })
  }
  if (apt.status === 'cancelled') {
    return NextResponse.json({ error: 'Appointment is already cancelled' }, { status: 400 })
  }

  // Get tenant info for notifications
  const { data: tenant } = await svc
    .from('tenants')
    .select('id, name, email, phone, address, settings')
    .eq('id', apt.tenant_id)
    .single()

  const service = apt.services as unknown as { name: string; duration_minutes: number } | null
  const staff = apt.staff as unknown as { name: string } | null
  const client = apt.clients as unknown as { first_name: string; last_name: string; email: string | null; phone: string | null } | null
  const clientName = client ? `${client.first_name} ${client.last_name || ''}`.trim() : 'Client'
  // Greeting format: "Dear James D." instead of full name
  const clientGreeting = client
    ? (client.last_name ? `${client.first_name} ${client.last_name[0]}.` : client.first_name)
    : 'Client'
  const serviceName = service?.name || 'Service'
  const staffName = staff?.name || ''
  const businessName = tenant?.name || 'the salon'
  const businessPhone = tenant?.phone || ''

  const tenantSettings = (tenant?.settings || {}) as Record<string, unknown>
  const tz = (tenantSettings.timezone as string) || (tenant as { timezone?: string })?.timezone || 'America/Los_Angeles'

  if (action === 'cancel') {
    // Cancel the appointment
    const { error: updateErr } = await svc
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', apt.id)

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to cancel appointment' }, { status: 500 })
    }

    // Cancel pending reminders
    await svc
      .from('appointment_reminders')
      .update({ status: 'skipped' })
      .eq('appointment_id', apt.id)
      .eq('status', 'pending')

    // Notify business owner
    await notifyOwner({
      type: 'cancel',
      tenant,
      clientName,
      serviceName,
      staffName,
      startTime: new Date(apt.start_time),
      tz,
    })

    return NextResponse.json({ success: true, message: 'Appointment cancelled' })

  } else if (action === 'reschedule') {
    if (!new_start_time) {
      return NextResponse.json({ error: 'Missing new_start_time' }, { status: 400 })
    }

    const newStart = new Date(new_start_time)
    const duration = service?.duration_minutes || 60
    const newEnd = new Date(newStart.getTime() + duration * 60 * 1000)

    // Check for conflicts
    if (apt.staff_id) {
      const { data: conflicts } = await svc
        .from('appointments')
        .select('id')
        .eq('tenant_id', apt.tenant_id)
        .eq('staff_id', apt.staff_id)
        .neq('id', apt.id) // exclude current appointment
        .in('status', ['pending', 'confirmed', 'blocked'])
        .lt('start_time', newEnd.toISOString())
        .gt('end_time', newStart.toISOString())
        .limit(1)

      if (conflicts && conflicts.length > 0) {
        return NextResponse.json(
          { error: 'This time slot is no longer available. Please choose another time.' },
          { status: 409 }
        )
      }
    }

    // Update appointment times
    const { error: updateErr } = await svc
      .from('appointments')
      .update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
      })
      .eq('id', apt.id)

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to reschedule' }, { status: 500 })
    }

    // Update reminders: delete old pending ones, create new ones
    await svc
      .from('appointment_reminders')
      .delete()
      .eq('appointment_id', apt.id)
      .eq('status', 'pending')

    // Create new reminders
    const reminderRows: { tenant_id: string; appointment_id: string; client_id: string; type: string; channel: string; status: string }[] = []
    if (apt.client_id) {
      if (client?.phone) {
        reminderRows.push({ tenant_id: apt.tenant_id, appointment_id: apt.id, client_id: apt.client_id, type: '24h', channel: 'sms', status: 'pending' })
      }
      if (client?.email) {
        reminderRows.push({ tenant_id: apt.tenant_id, appointment_id: apt.id, client_id: apt.client_id, type: '24h', channel: 'email', status: 'pending' })
      }
    }
    if (reminderRows.length > 0) {
      await svc.from('appointment_reminders').insert(reminderRows)
    }

    // Notify business owner
    await notifyOwner({
      type: 'reschedule',
      tenant,
      clientName,
      serviceName,
      staffName,
      startTime: newStart,
      oldStartTime: new Date(apt.start_time),
      tz,
    })

    // Send confirmation to client
    await notifyClient({
      tenant,
      client,
      clientName,
      serviceName,
      staffName,
      startTime: newStart,
      businessName,
      businessPhone,
      tz,
    })

    return NextResponse.json({
      success: true,
      message: 'Appointment rescheduled',
      new_start_time: newStart.toISOString(),
      new_end_time: newEnd.toISOString(),
    })

  } else {
    return NextResponse.json({ error: 'Invalid action. Use "cancel" or "reschedule"' }, { status: 400 })
  }
}

// ── Notify business owner of changes ──
async function notifyOwner(opts: {
  type: 'cancel' | 'reschedule'
  tenant: { name: string; email: string | null; phone: string | null; settings: Record<string, unknown> | null } | null
  clientName: string
  serviceName: string
  staffName: string
  startTime: Date
  oldStartTime?: Date
  tz: string
}) {
  const { type, tenant, clientName, serviceName, staffName, startTime, oldStartTime, tz } = opts
  if (!tenant) return

  let dateStr: string, timeStr: string
  try {
    dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
    timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  } catch {
    dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const emoji = type === 'cancel' ? '❌' : '🔄'
  const action = type === 'cancel' ? 'Cancelled' : 'Rescheduled'

  let oldDateStr = '', oldTimeStr = ''
  if (oldStartTime) {
    try {
      oldDateStr = oldStartTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
      oldTimeStr = oldStartTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
    } catch {
      oldDateStr = oldStartTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      oldTimeStr = oldStartTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
  }

  // SMS to owner
  const ownerPhone = tenant.phone
  if (ownerPhone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    const smsBody = type === 'cancel'
      ? `${emoji} Appointment ${action}\n\nClient: ${clientName}\n📋 ${serviceName}\n📅 Was: ${dateStr} at ${timeStr}\n${staffName ? `💇 Staff: ${staffName}` : ''}`
      : `${emoji} Appointment ${action}\n\nClient: ${clientName}\n📋 ${serviceName}\n📅 Was: ${oldDateStr} at ${oldTimeStr}\n📅 New: ${dateStr} at ${timeStr}\n${staffName ? `💇 Staff: ${staffName}` : ''}`

    const ownerE164 = toE164(ownerPhone)
    if (ownerE164) {
      try {
        const sid = process.env.TWILIO_ACCOUNT_SID!
        const token = process.env.TWILIO_AUTH_TOKEN!
        const from = process.env.TWILIO_PHONE_NUMBER!
        const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
        const auth = btoa(`${sid}:${token}`)
        await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: ownerE164, From: from, Body: smsBody }).toString(),
        })
      } catch (err) {
        console.error(`[manage-appointment] SMS to owner failed:`, err)
      }
    }
  }

  // Email to owner
  const ownerEmail = tenant.email || ((tenant.settings || {}) as Record<string, unknown>).owner_email as string || null
  if (ownerEmail && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const emailBody = type === 'cancel'
        ? `Appointment ${action} by client.\n\nClient: ${clientName}\nService: ${serviceName}\nWas scheduled: ${dateStr} at ${timeStr}\n${staffName ? `Staff: ${staffName}` : ''}`
        : `Appointment ${action} by client.\n\nClient: ${clientName}\nService: ${serviceName}\nOriginal: ${oldDateStr} at ${oldTimeStr}\nNew: ${dateStr} at ${timeStr}\n${staffName ? `Staff: ${staffName}` : ''}`

      await resend.emails.send({
        from: `GlowUp <bookings@joinglowup.org>`,
        to: [ownerEmail],
        subject: `${emoji} ${action}: ${clientName} — ${serviceName}`,
        text: emailBody,
      })
    } catch (err) {
      console.error(`[manage-appointment] Email to owner failed:`, err)
    }
  }
}

// ── Notify client of reschedule confirmation ──
async function notifyClient(opts: {
  tenant: { name: string; email: string | null; phone: string | null } | null
  client: { first_name: string; last_name: string; email: string | null; phone: string | null } | null
  clientName: string
  serviceName: string
  staffName: string
  startTime: Date
  businessName: string
  businessPhone: string
  tz: string
}) {
  const { client, clientName, serviceName, staffName, startTime, businessName, businessPhone, tz } = opts
  if (!client) return

  // Greeting format: "Dear James D." instead of full name
  const clientGreeting = client.last_name
    ? `${client.first_name} ${client.last_name[0]}.`
    : client.first_name

  let dateStr: string, timeStr: string
  try {
    dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
    timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  } catch {
    dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  // SMS
  if (client.phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    const smsBody = `🔄 Appointment Rescheduled!\n\nDear ${clientGreeting}, your appointment has been updated:\n📋 ${serviceName}\n📅 ${dateStr} at ${timeStr}\n${staffName ? `💇 With: ${staffName}` : ''}\n\nNeed to change? Contact us at ${businessPhone || 'the salon'}.`
    const clientE164 = toE164(client.phone)
    if (clientE164) {
      try {
        const sid = process.env.TWILIO_ACCOUNT_SID!
        const token = process.env.TWILIO_AUTH_TOKEN!
        const from = process.env.TWILIO_PHONE_NUMBER!
        const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
        const auth = btoa(`${sid}:${token}`)
        await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: clientE164, From: from, Body: smsBody }).toString(),
        })
      } catch (err) {
        console.error(`[manage-appointment] SMS to client failed:`, err)
      }
    }
  }

  // Email
  if (client.email && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const rescheduleHtml = rescheduleConfirmationHtml({
        greeting: clientGreeting,
        serviceName,
        dateStr,
        timeStr,
        staffName,
        businessName,
        businessPhone,
      })
      await resend.emails.send({
        from: `${businessName} <bookings@joinglowup.org>`,
        to: [client.email],
        subject: `🔄 Appointment Rescheduled — ${serviceName} on ${dateStr}`,
        html: rescheduleHtml,
      })
    } catch (err) {
      console.error(`[manage-appointment] Email to client failed:`, err)
    }
  }
}
