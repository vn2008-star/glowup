// ─── AI Receptionist core ───
// Shared by the web chat widget (/api/ai-chat) and the inbound SMS webhook
// (/api/twilio-webhook). Answers questions with real business data, recognizes
// returning clients by phone number ("Hi Mary! 👋"), and (when enabled) books
// appointments directly.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveTenantTz, sendClientBookingConfirmation, scheduleClientReminders } from '@/lib/notifications'
import { localToUTC, nowInTz, formatInTz } from '@/lib/tz'
import { phoneVariants } from '@/lib/utils'

// Try models in order — Google retires free-tier quota per model without
// warning (gemini-2.0-flash now returns 429 with limit 0), so a single
// hardcoded model is a time bomb. The "-latest" aliases track current models.
const GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest']
const geminiUrl = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

type DayHours = { open: string; close: string; closed: boolean }

export type TenantRow = {
  id: string
  name: string
  slug: string
  phone: string | null
  email: string | null
  address: string | null
  timezone: string | null
  settings: Record<string, unknown> | null
}

export type BotConfig = {
  enabled: boolean
  greeting: string
  after_hours: string
  booking_prompt: string
  faq: { q: string; a: string }[]
  auto_booking: boolean
  channels: Record<string, boolean>
}

export function resolveBotConfig(tenant: TenantRow): BotConfig {
  const raw = ((tenant.settings || {}) as Record<string, unknown>).bot_config as Partial<BotConfig> | undefined
  return {
    enabled: true,
    greeting: "Hi there! 👋 How can I help you today?",
    after_hours: "Thanks for your message! We're currently closed but will get back to you first thing tomorrow.",
    booking_prompt: "Would you like to book an appointment?",
    faq: [],
    auto_booking: false,
    channels: { web: true, sms: false, instagram: false, facebook: false },
    ...raw,
  }
}

type KnownClient = { id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null; visit_count: number | null }

function buildSystemPrompt(opts: {
  tenant: TenantRow
  hours: Record<string, DayHours> | null
  services: { name: string; category: string; duration_minutes: number; price: number }[]
  staff: { name: string; specialties: string[] }[]
  availableSlots: string[]
  botConfig: BotConfig
  bookingUrl: string
  tz: string
  todayStr: string
  knownClient: KnownClient | null
  channel: 'web' | 'sms'
}): string {
  const { tenant, hours, services, staff, availableSlots, botConfig, bookingUrl, tz, todayStr, knownClient, channel } = opts
  const now = new Date()
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz })
  const currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const todayHours = hours?.[dayName]
  const isOpen = todayHours && !todayHours.closed

  const serviceList = services.map(s => `  - ${s.name} (${s.category}) — ${s.duration_minutes} min, $${s.price}`).join('\n')
  const staffList = staff.map(s => `  - ${s.name}${s.specialties?.length ? ` (${[...new Set(s.specialties)].join(', ')})` : ''}`).join('\n')
  const faqList = botConfig.faq.filter(f => f.q && f.a).map(f => `  Q: ${f.q}\n  A: ${f.a}`).join('\n')
  const slotStr = availableSlots.length > 0
    ? `Available appointment slots today:\n  ${availableSlots.slice(0, 10).join(', ')}`
    : 'No available slots for today.'

  // Recognized returning client → personal greeting, minimal detail exposure
  const knownClientBlock = knownClient
    ? `
KNOWN CLIENT:
- You are chatting with a returning client: ${knownClient.first_name}${knownClient.visit_count ? ` (${knownClient.visit_count} previous visit${knownClient.visit_count !== 1 ? 's' : ''})` : ''}.
- Greet them warmly BY FIRST NAME (e.g., "Hi ${knownClient.first_name}! 👋") in your next reply if you haven't already.
- Their phone number is already on file — never ask them for it again.
- Do not reveal any other stored personal details. For appointment changes, direct them to the links or the salon phone.`
    : ''

  const bookingRules = botConfig.auto_booking
    ? (knownClient
        ? `- You CAN book appointments directly. Their name and phone are on file, so just confirm the service, date, and time. When confirmed, respond with BOOK_APPOINTMENT:{service_name}|{staff_name_or_any}|{date_YYYY-MM-DD}|{time_HH:MM}|${knownClient.first_name}|KNOWN on its own line at the end of your message.`
        : `- You CAN book appointments directly. FIRST collect the client's full name AND phone number — never book without both. When the client has confirmed a time AND given their name and phone, respond with BOOK_APPOINTMENT:{service_name}|{staff_name_or_any}|{date_YYYY-MM-DD}|{time_HH:MM}|{client_name}|{client_phone} on its own line at the end of your message.`)
    : '- Direct them to the booking page to complete their booking.'

  return `You are the AI Receptionist for "${tenant.name}", a beauty/salon business${channel === 'sms' ? ', replying by text message (SMS)' : ''}.

PERSONALITY & RULES:
- Be warm, friendly, and professional. Use emojis sparingly (1-2 per message max).
- Keep responses concise (2-4 sentences unless they ask for details).${channel === 'sms' ? ' Keep SMS replies under 300 characters when possible.' : ''}
- Never make up information. Only share what's provided below.
- If you don't know something, say "Let me check with our team and get back to you!"
- When a client wants to book, suggest available times and provide the booking link.
- Never discuss pricing of competitors or other businesses.
${knownClientBlock}
BUSINESS INFO:
- Name: ${tenant.name}
- Phone: ${tenant.phone || 'Not listed'}
- Address: ${tenant.address || 'Not listed'}
- Current time: ${dayName}, ${currentTime} (today's date: ${todayStr})
- Status: ${isOpen ? `Open (${todayHours!.open} - ${todayHours!.close})` : 'Currently closed'}
${hours ? `- Weekly hours:\n${Object.entries(hours).map(([day, h]) => `  ${day}: ${h.closed ? 'Closed' : `${h.open} - ${h.close}`}`).join('\n')}` : ''}

SERVICES OFFERED:
${serviceList || '  No services listed'}

OUR TEAM:
${staffList || '  No staff listed'}

${slotStr}

BOOKING:
- Online booking page: ${bookingUrl}
${bookingRules}

CUSTOM FAQ:
${faqList || '  No custom FAQ set up'}

${!isOpen ? `AFTER-HOURS NOTE: ${botConfig.after_hours}` : ''}
`
}

// Parse booking intent (service|staff|date|time|name|phone-or-KNOWN)
function parseBookingIntent(response: string): { service: string; staff: string; date: string; time: string; clientName: string; clientPhone: string } | null {
  const match = response.match(/BOOK_APPOINTMENT:(.+?)\|(.+?)\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})\|(.+?)\|(KNOWN|[\d\s()+-]{7,})/)
  if (!match) return null
  return { service: match[1].trim(), staff: match[2].trim(), date: match[3], time: match[4], clientName: match[5].trim(), clientPhone: match[6].trim() }
}

/** Extract a US phone number typed inside a chat message, if any. */
function phoneInText(text: string): string | null {
  const m = text.match(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/)
  return m ? m[0] : null
}

export type AiChatResult =
  | { ok: true; response: string; conversationId: string | null; booking: { success: boolean; appointment_id?: string } | null; savedMessage: unknown }
  | { ok: false; error: string; status: number }

export async function handleAiChat(opts: {
  svc: SupabaseClient
  tenant: TenantRow
  message: string
  conversationId?: string | null
  /** Verified sender phone (SMS channel) — enables "Hi Mary" recognition. */
  clientPhone?: string | null
  channel: 'web' | 'sms'
}): Promise<AiChatResult> {
  const { svc, tenant, message, channel } = opts
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return { ok: false, error: 'AI not configured — add GOOGLE_AI_API_KEY to environment', status: 500 }

  const botConfig = resolveBotConfig(tenant)
  if (botConfig.enabled === false) return { ok: false, error: 'Chat is currently unavailable', status: 403 }

  const tenantId = tenant.id
  const settings = (tenant.settings || {}) as Record<string, unknown>

  // All "today" math in the SALON's timezone — the server runs in UTC.
  const tz = resolveTenantTz(tenant)
  const local = nowInTz(tz)
  const todayStr = local.dateStr
  const dayStart = localToUTC(todayStr, '00:00', tz)
  const dayEndISO = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString()

  const [servicesRes, staffRes, appointmentsRes] = await Promise.all([
    svc.from('services').select('id, name, category, duration_minutes, price').eq('tenant_id', tenantId).eq('is_active', true),
    svc.from('staff').select('id, name, specialties').eq('tenant_id', tenantId).eq('is_active', true).neq('name', 'Admin'),
    svc.from('appointments').select('start_time, end_time, staff_id')
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'confirmed', 'blocked'])
      .gte('start_time', dayStart.toISOString())
      .lt('start_time', dayEndISO),
  ])

  // ── Identify the client ("Hi Mary!") ──
  // 1. Verified phone from SMS. 2. Client already linked to this conversation.
  // 3. A phone number the visitor typed into the web chat.
  let knownClient: KnownClient | null = null
  const lookupClient = async (phone: string) => {
    const { data } = await svc
      .from('clients')
      .select('id, first_name, last_name, phone, email, visit_count')
      .eq('tenant_id', tenantId)
      .in('phone', phoneVariants(phone))
      .limit(1)
      .maybeSingle()
    return (data as KnownClient) || null
  }
  if (opts.clientPhone) {
    knownClient = await lookupClient(opts.clientPhone)
  }
  if (!knownClient && opts.conversationId) {
    const { data: conv } = await svc
      .from('conversations')
      .select('client_id')
      .eq('id', opts.conversationId)
      .maybeSingle()
    if (conv?.client_id) {
      const { data } = await svc
        .from('clients')
        .select('id, first_name, last_name, phone, email, visit_count')
        .eq('id', conv.client_id)
        .maybeSingle()
      knownClient = (data as KnownClient) || null
    }
  }
  if (!knownClient) {
    const typedPhone = phoneInText(message)
    if (typedPhone) knownClient = await lookupClient(typedPhone)
  }

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
    // Round up to the next :00/:30 boundary so we never offer "9:36 AM"
    const firstSlot = Math.ceil(Math.max(openMin, nowMin + 30) / 30) * 30
    for (let m = firstSlot; m + 30 <= closeMin; m += 30) {
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

  const systemPrompt = buildSystemPrompt({
    tenant, hours, services: servicesRes.data || [], staff: staffRes.data || [],
    availableSlots, botConfig, bookingUrl, tz, todayStr, knownClient, channel,
  })

  // ── Conversation persistence (chats land in the owner's Inbox) ──
  let convId: string | null = opts.conversationId || null
  if (!convId) {
    const { data: conv } = await svc
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        client_id: knownClient?.id || null,
        channel,
        status: 'open',
        last_message: message,
        last_message_at: new Date().toISOString(),
        unread_count: 1,
      })
      .select('id')
      .single()
    convId = conv?.id || null
  } else if (knownClient) {
    // Link the client once identified mid-conversation
    await svc.from('conversations').update({ client_id: knownClient.id }).eq('id', convId).is('client_id', null)
  }

  // History BEFORE saving the new user message (avoids duplication)
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
      sender_name: knownClient ? `${knownClient.first_name}${knownClient.last_name ? ' ' + knownClient.last_name : ''}` : (channel === 'sms' ? 'SMS Client' : 'Web Visitor'),
      content: message,
    })
  }

  // ── Call Gemini, walking the model list ──
  const geminiBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [...conversationHistory, { role: 'user', parts: [{ text: message }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 800, topP: 0.9 },
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
      console.error(`[ai-receptionist] ${model} error (${geminiRes.status}):`, (await geminiRes.text()).slice(0, 300))
    }
  }
  if (!aiResponse) return { ok: false, error: 'AI service unavailable', status: 502 }

  // ── Auto-booking ──
  let bookingResult: { success: boolean; appointment_id?: string; service?: string; time?: string } | null = null
  if (botConfig.auto_booking) {
    const intent = parseBookingIntent(aiResponse)
    aiResponse = aiResponse.replace(/BOOK_APPOINTMENT:.+/, '').trim()

    if (intent) {
      const service = (servicesRes.data || []).find(s => s.name.toLowerCase().includes(intent.service.toLowerCase()))
      // "KNOWN" phone token → use the identified client's number
      const bookingPhone = intent.clientPhone === 'KNOWN' ? (knownClient?.phone || null) : intent.clientPhone.trim()

      if (service && bookingPhone) {
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

        // Find or create the client
        let clientId: string | null = knownClient?.id || null
        let clientEmail: string | null = knownClient?.email || null
        if (!clientId) {
          const [firstName, ...lastParts] = intent.clientName.split(/\s+/)
          const { data: existingClient } = await svc
            .from('clients')
            .select('id, email')
            .eq('tenant_id', tenantId)
            .in('phone', phoneVariants(bookingPhone))
            .limit(1)
            .maybeSingle()
          if (existingClient) {
            clientId = existingClient.id
            clientEmail = existingClient.email
          } else {
            const { data: newClient } = await svc
              .from('clients')
              .insert({ tenant_id: tenantId, first_name: firstName, last_name: lastParts.join(' ') || null, phone: bookingPhone, status: 'new' })
              .select('id')
              .single()
            clientId = newClient?.id || null
          }
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
            const staffName = (staffRes.data || []).find(s => s.id === staffId)?.name || ''
            const manageLink = appt.manage_token ? `${baseUrl}/manage/${appt.manage_token}` : ''
            try {
              await scheduleClientReminders(svc, {
                tenantId, appointmentId: appt.id, clientId,
                clientPhone: bookingPhone, clientEmail,
              })
              await sendClientBookingConfirmation({
                businessName: tenant.name, businessAddress: tenant.address || '',
                businessPhone: tenant.phone || '', businessEmail: tenant.email || null,
                serviceName: service.name, staffName,
                clientName: knownClient ? `${knownClient.first_name}${knownClient.last_name ? ' ' + knownClient.last_name : ''}` : intent.clientName,
                clientEmail, clientPhone: bookingPhone, manageLink,
                start: startTime, end: endTime, timezone: tz,
              })
            } catch (err) {
              console.error('[ai-receptionist] booking confirmation failed:', err)
            }
          } else {
            console.error('[ai-receptionist] auto-booking insert failed:', apptErr)
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

  // Save the AI reply
  let savedMessage: unknown = null
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
        .update({ last_message: aiResponse, last_message_at: msg.created_at, unread_count: 1 })
        .eq('id', convId)
      savedMessage = msg
    }
  }

  return { ok: true, response: aiResponse, conversationId: convId, booking: bookingResult, savedMessage }
}
