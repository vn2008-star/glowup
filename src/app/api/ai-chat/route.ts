import { NextResponse } from 'next/server'
import { createClient as createBrowserClient } from '@supabase/supabase-js'
import { resolveTenantTz, sendClientBookingConfirmation, scheduleClientReminders } from '@/lib/notifications'
import { localToUTC, nowInTz, formatInTz } from '@/lib/tz'
import { toE164 } from '@/lib/utils'

// Try models in order — Google retires free-tier quota per model without
// warning (gemini-2.0-flash now returns 429 with limit 0), so a single
// hardcoded model is a time bomb. The "-latest" aliases track current models.
const GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest']
const geminiUrl = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

type DayHours = { open: string; close: string; closed: boolean }

// Service-role client for cross-tenant reads (chat widget has no auth)
function createServiceClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Build a rich system prompt with real business data
function buildSystemPrompt(
  business: { name: string; phone: string | null; address: string | null; hours: Record<string, DayHours> | null },
  services: { name: string; category: string; duration_minutes: number; price: number }[],
  staff: { name: string; specialties: string[] }[],
  availableSlots: string[],
  botConfig: { greeting: string; after_hours: string; booking_prompt: string; faq: { q: string; a: string }[]; auto_booking: boolean },
  bookingUrl: string,
  tz: string,
  todayStr: string,
) {
  const now = new Date()
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz })
  const currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const todayHours = business.hours?.[dayName]
  const isOpen = todayHours && !todayHours.closed

  const serviceList = services.map(s => `  - ${s.name} (${s.category}) — ${s.duration_minutes} min, $${s.price}`).join('\n')
  const staffList = staff.map(s => `  - ${s.name}${s.specialties?.length ? ` (${[...new Set(s.specialties)].join(', ')})` : ''}`).join('\n')
  const faqList = botConfig.faq.filter(f => f.q && f.a).map(f => `  Q: ${f.q}\n  A: ${f.a}`).join('\n')
  const slotStr = availableSlots.length > 0
    ? `Available appointment slots today:\n  ${availableSlots.slice(0, 10).join(', ')}`
    : 'No available slots for today.'

  return `You are the AI Receptionist for "${business.name}", a beauty/salon business.

PERSONALITY & RULES:
- Be warm, friendly, and professional. Use emojis sparingly (1-2 per message max).
- Keep responses concise (2-4 sentences unless they ask for details).
- Never make up information. Only share what's provided below.
- If you don't know something, say "Let me check with our team and get back to you!"
- When a client wants to book, suggest available times and provide the booking link.
- Never discuss pricing of competitors or other businesses.

BUSINESS INFO:
- Name: ${business.name}
- Phone: ${business.phone || 'Not listed'}
- Address: ${business.address || 'Not listed'}
- Current time: ${dayName}, ${currentTime} (today's date: ${todayStr})
- Status: ${isOpen ? `Open (${todayHours!.open} - ${todayHours!.close})` : 'Currently closed'}
${business.hours ? `- Weekly hours:\n${Object.entries(business.hours).map(([day, h]) => `  ${day}: ${h.closed ? 'Closed' : `${h.open} - ${h.close}`}`).join('\n')}` : ''}

SERVICES OFFERED:
${serviceList || '  No services listed'}

OUR TEAM:
${staffList || '  No staff listed'}

${slotStr}

BOOKING:
- Online booking page: ${bookingUrl}
${botConfig.auto_booking
    ? `- You CAN book appointments directly. FIRST collect the client's full name AND phone number — never book without both. When the client has confirmed a time AND given their name and phone, respond with BOOK_APPOINTMENT:{service_name}|{staff_name_or_any}|{date_YYYY-MM-DD}|{time_HH:MM}|{client_name}|{client_phone} on its own line at the end of your message.`
    : '- Direct them to the booking page to complete their booking.'}

CUSTOM FAQ:
${faqList || '  No custom FAQ set up'}

${!isOpen ? `AFTER-HOURS NOTE: ${botConfig.after_hours}` : ''}
`
}

// Parse booking intent from AI response (service|staff|date|time|name|phone)
function parseBookingIntent(response: string): { service: string; staff: string; date: string; time: string; clientName: string; clientPhone: string } | null {
  const match = response.match(/BOOK_APPOINTMENT:(.+?)\|(.+?)\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})\|(.+?)\|([\d\s()+-]{7,})/)
  if (!match) return null
  return { service: match[1].trim(), staff: match[2].trim(), date: match[3], time: match[4], clientName: match[5].trim(), clientPhone: match[6].trim() }
}

export async function POST(request: Request) {
  try {
    const { message, conversation_id, slug, tenant_id } = await request.json()

    if (!message || !slug) {
      return NextResponse.json({ error: 'Missing message or slug' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured — add GOOGLE_AI_API_KEY to environment' }, { status: 500 })
    }

    const svc = createServiceClient()

    // Load tenant by slug. NOTE: business hours live in settings.business_hours
    // (there is no tenants.hours column — selecting one errored the whole query
    // and every chat got "Business not found").
    const { data: tenant } = await svc
      .from('tenants')
      .select('id, name, slug, phone, email, address, timezone, settings')
      .eq('slug', slug)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Use bot config or defaults
    const tenantId = tenant_id || tenant.id
    const settings = (tenant.settings || {}) as Record<string, unknown>
    const rawBotConfig = settings.bot_config as {
      enabled?: boolean; greeting: string; after_hours: string; booking_prompt: string;
      faq: { q: string; a: string }[]; auto_booking: boolean; channels: Record<string, boolean>
    } | undefined

    const botConfig = {
      enabled: true,
      greeting: "Hi there! 👋 How can I help you today?",
      after_hours: "Thanks for your message! We're currently closed but will get back to you first thing tomorrow.",
      booking_prompt: "Would you like to book an appointment?",
      faq: [] as { q: string; a: string }[],
      auto_booking: false,
      channels: { web: true, sms: false, instagram: false, facebook: false },
      ...rawBotConfig,
    }

    if (botConfig.enabled === false) {
      return NextResponse.json({ error: 'Chat is currently unavailable' }, { status: 403 })
    }

    // All "today" math in the SALON's timezone — the server runs in UTC, so
    // using server-local Date gave wrong day/hours/slots for every salon.
    const tz = resolveTenantTz(tenant)
    const local = nowInTz(tz)
    const todayStr = local.dateStr
    const dayStartISO = localToUTC(todayStr, '00:00', tz).toISOString()
    const dayEndISO = new Date(localToUTC(todayStr, '00:00', tz).getTime() + 24 * 60 * 60 * 1000).toISOString()

    // Load business data in parallel
    const [servicesRes, staffRes, appointmentsRes] = await Promise.all([
      svc.from('services').select('id, name, category, duration_minutes, price').eq('tenant_id', tenantId).eq('is_active', true),
      svc.from('staff').select('id, name, specialties').eq('tenant_id', tenantId).eq('is_active', true).neq('name', 'Admin'),
      svc.from('appointments').select('start_time, end_time, staff_id')
        .eq('tenant_id', tenantId)
        .in('status', ['pending', 'confirmed', 'blocked'])
        .gte('start_time', dayStartISO)
        .lt('start_time', dayEndISO),
    ])

    // Calculate available slots for today (salon-local)
    const hours = (settings.business_hours || null) as Record<string, DayHours> | null
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: tz })
    const todayHours = hours?.[dayName]
    const availableSlots: string[] = []

    if (todayHours && !todayHours.closed) {
      const [openH, openM] = todayHours.open.split(':').map(Number)
      const [closeH, closeM] = todayHours.close.split(':').map(Number)
      const openMin = openH * 60 + (openM || 0)
      const closeMin = closeH * 60 + (closeM || 0)
      const nowMin = local.hour * 60 + local.minute

      const bookedTimes = new Set(
        (appointmentsRes.data || []).map(a =>
          formatInTz(a.start_time, tz, { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/^24/, '00')
        )
      )

      for (let m = Math.max(openMin, nowMin + 30); m + 30 <= closeMin; m += 30) {
        const h = Math.floor(m / 60)
        const min = m % 60
        const timeStr = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
        if (!bookedTimes.has(timeStr)) {
          const h12 = h % 12 || 12
          const ampm = h >= 12 ? 'PM' : 'AM'
          availableSlots.push(`${h12}:${String(min).padStart(2, '0')} ${ampm}`)
        }
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
      || 'https://glowup-jade.vercel.app'
    const bookingUrl = `${baseUrl}/book/${tenant.slug}`

    // Build system prompt
    const systemPrompt = buildSystemPrompt(
      { name: tenant.name, phone: tenant.phone, address: tenant.address, hours },
      servicesRes.data || [],
      staffRes.data || [],
      availableSlots,
      botConfig as { greeting: string; after_hours: string; booking_prompt: string; faq: { q: string; a: string }[]; auto_booking: boolean },
      bookingUrl,
      tz,
      todayStr,
    )

    // ── Conversation persistence ──
    // Create a conversation on first message so the whole chat lands in the
    // owner's Inbox. (Previously no conversation was ever created — the widget
    // waited for an id the API only produced when given an id, so web chats
    // vanished without a trace.)
    let convId: string | null = conversation_id || null
    if (!convId) {
      const { data: conv } = await svc
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          channel: 'web',
          status: 'open',
          last_message: message,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select('id')
        .single()
      convId = conv?.id || null
    }

    // Load conversation history BEFORE saving the new user message (so the
    // history doesn't duplicate it), then persist the incoming message.
    let conversationHistory: { role: string; parts: { text: string }[] }[] = []
    if (convId) {
      const { data: pastMessages } = await svc
        .from('messages')
        .select('sender_type, content')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(20)

      conversationHistory = (pastMessages || []).map(m => ({
        role: m.sender_type === 'client' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }))

      await svc.from('messages').insert({
        conversation_id: convId,
        tenant_id: tenantId,
        sender_type: 'client',
        sender_name: 'Web Visitor',
        content: message,
      })
    }

    // Call Gemini — walk the model list until one answers
    const geminiBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...conversationHistory,
        { role: 'user', parts: [{ text: message }] },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
        topP: 0.9,
      },
    }

    let aiResponse: string | null = null
    for (const model of GEMINI_MODELS) {
      const geminiRes = await fetch(`${geminiUrl(model)}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      })
      if (geminiRes.ok) {
        const geminiData = await geminiRes.json()
        aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || null
        if (aiResponse) break
      } else {
        console.error(`[ai-chat] ${model} error (${geminiRes.status}):`, (await geminiRes.text()).slice(0, 300))
      }
    }

    if (!aiResponse) {
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 })
    }

    // ── Auto-booking ──
    let bookingResult: { success: boolean; appointment_id?: string; service?: string; time?: string } | null = null
    if (botConfig.auto_booking) {
      const intent = parseBookingIntent(aiResponse)
      // Always strip the machine tag from the visible reply, even if we can't book
      aiResponse = aiResponse.replace(/BOOK_APPOINTMENT:.+/, '').trim()

      if (intent) {
        const service = (servicesRes.data || []).find(s =>
          s.name.toLowerCase().includes(intent.service.toLowerCase())
        )

        if (service) {
          // Salon-timezone start (server-local parsing shifted every booking)
          const startTime = localToUTC(intent.date, intent.time, tz)
          const endTime = new Date(startTime.getTime() + service.duration_minutes * 60 * 1000)

          // Resolve staff: named, or first active member free for the window
          let staffId: string | null = null
          if (intent.staff.toLowerCase() !== 'any') {
            staffId = (staffRes.data || []).find(s => s.name.toLowerCase().includes(intent.staff.toLowerCase()))?.id || null
          }
          if (!staffId) {
            const { data: busy } = await svc
              .from('appointments')
              .select('staff_id')
              .eq('tenant_id', tenantId)
              .in('status', ['pending', 'confirmed', 'blocked'])
              .lt('start_time', endTime.toISOString())
              .gt('end_time', startTime.toISOString())
            const busyIds = new Set((busy || []).map(b => b.staff_id))
            staffId = (staffRes.data || []).find(s => !busyIds.has(s.id))?.id || null
          }

          // Find or create the client from the collected name + phone
          let clientId: string | null = null
          const phone = intent.clientPhone.trim()
          const [firstName, ...lastParts] = intent.clientName.split(/\s+/)
          const { data: existingClient } = await svc
            .from('clients')
            .select('id, email')
            .eq('tenant_id', tenantId)
            .eq('phone', phone)
            .maybeSingle()
          if (existingClient) {
            clientId = existingClient.id
          } else {
            const { data: newClient } = await svc
              .from('clients')
              .insert({ tenant_id: tenantId, first_name: firstName, last_name: lastParts.join(' ') || null, phone, status: 'new' })
              .select('id')
              .single()
            clientId = newClient?.id || null
          }

          if (staffId && clientId) {
            const { data: appt, error: apptErr } = await svc
              .from('appointments')
              .insert({
                tenant_id: tenantId,
                client_id: clientId,
                service_id: service.id,
                staff_id: staffId,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                status: 'confirmed',
                total_price: service.price || 0,
                notes: `Booked via AI Receptionist`,
              })
              .select('id, manage_token')
              .single()

            if (appt) {
              bookingResult = { success: true, appointment_id: appt.id, service: service.name, time: intent.time }
              // Same confirmation + reminders as every other booking path
              const staffName = (staffRes.data || []).find(s => s.id === staffId)?.name || ''
              const manageLink = appt.manage_token ? `${baseUrl}/manage/${appt.manage_token}` : ''
              try {
                await scheduleClientReminders(svc, {
                  tenantId, appointmentId: appt.id, clientId,
                  clientPhone: phone, clientEmail: existingClient?.email || null,
                })
                await sendClientBookingConfirmation({
                  businessName: tenant.name, businessAddress: tenant.address || '',
                  businessPhone: tenant.phone || '', businessEmail: tenant.email || null,
                  serviceName: service.name, staffName,
                  clientName: intent.clientName, clientEmail: existingClient?.email || null,
                  clientPhone: phone, manageLink,
                  start: startTime, end: endTime, timezone: tz,
                })
              } catch (err) {
                console.error('[ai-chat] booking confirmation failed:', err)
              }
            } else {
              // 23P01 = slot was taken (exclusion constraint) — tell the client
              console.error('[ai-chat] auto-booking insert failed:', apptErr)
              bookingResult = { success: false }
              aiResponse += `\n\n⚠️ I'm sorry — that time was just taken. Could you pick another time?`
            }
          } else if (!staffId) {
            bookingResult = { success: false }
            aiResponse += `\n\n⚠️ No one is available at that time. Could you pick another time?`
          }
        }
      }
    }

    // Save the AI response as a bot message
    let savedMessage = null
    if (convId) {
      const { data: msg } = await svc
        .from('messages')
        .insert({
          conversation_id: convId,
          tenant_id: tenantId,
          sender_type: 'bot',
          sender_name: 'AI Receptionist',
          content: aiResponse,
          metadata: bookingResult ? { booking: bookingResult } : {},
        })
        .select()
        .single()

      if (msg) {
        await svc
          .from('conversations')
          .update({
            last_message: aiResponse,
            last_message_at: msg.created_at,
            unread_count: 1,
          })
          .eq('id', convId)

        savedMessage = msg
      }
    }

    return NextResponse.json({
      response: aiResponse,
      conversation_id: convId,
      message: savedMessage,
      booking: bookingResult,
    })
  } catch (err) {
    console.error('AI Chat error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
