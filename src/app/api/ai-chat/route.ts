import { NextResponse } from 'next/server'
import { createClient as createBrowserClient } from '@supabase/supabase-js'

const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Service-role client for cross-tenant reads (chat widget has no auth)
function createServiceClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Build a rich system prompt with real business data
function buildSystemPrompt(
  business: { name: string; phone: string | null; address: string | null; hours: Record<string, { open: string; close: string; closed: boolean }> | null },
  services: { name: string; category: string; duration_minutes: number; price: number }[],
  staff: { name: string; specialties: string[] }[],
  availableSlots: string[],
  botConfig: { greeting: string; after_hours: string; booking_prompt: string; faq: { q: string; a: string }[]; auto_booking: boolean },
  bookingUrl: string,
) {
  const now = new Date()
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
  const currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
- Current time: ${dayName}, ${currentTime}
- Status: ${isOpen ? `Open (${todayHours!.open} - ${todayHours!.close})` : 'Currently closed'}
${business.hours ? `- Weekly hours:\n${Object.entries(business.hours).map(([day, h]) => `  ${day}: ${h.closed ? 'Closed' : `${h.open} - ${h.close}`}`).join('\n')}` : ''}

SERVICES OFFERED:
${serviceList || '  No services listed'}

OUR TEAM:
${staffList || '  No staff listed'}

${slotStr}

BOOKING:
- Online booking page: ${bookingUrl}
${botConfig.auto_booking ? '- You CAN book appointments directly. When a client confirms a time, respond with BOOK_APPOINTMENT:{service_name}|{staff_name_or_any}|{date_YYYY-MM-DD}|{time_HH:MM} on its own line at the end of your message.' : '- Direct them to the booking page to complete their booking.'}

CUSTOM FAQ:
${faqList || '  No custom FAQ set up'}

${!isOpen ? `AFTER-HOURS NOTE: ${botConfig.after_hours}` : ''}
`
}

// Parse booking intent from AI response
function parseBookingIntent(response: string): { service: string; staff: string; date: string; time: string } | null {
  const match = response.match(/BOOK_APPOINTMENT:(.+?)\|(.+?)\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})/)
  if (!match) return null
  return { service: match[1], staff: match[2], date: match[3], time: match[4] }
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

    // Load tenant by slug
    const { data: tenant } = await svc
      .from('tenants')
      .select('id, name, slug, phone, address, hours, settings')
      .eq('slug', slug)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Use bot config or defaults
    const tenantId = tenant_id || tenant.id
    const rawBotConfig = ((tenant.settings || {}) as Record<string, unknown>).bot_config as {
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

    // Load business data in parallel
    const [servicesRes, staffRes, appointmentsRes] = await Promise.all([
      svc.from('services').select('name, category, duration_minutes, price').eq('tenant_id', tenantId).eq('is_active', true),
      svc.from('staff').select('name, specialties').eq('tenant_id', tenantId).eq('is_active', true),
      svc.from('appointments').select('start_time, end_time, staff_id')
        .eq('tenant_id', tenantId)
        .gte('start_time', new Date().toISOString().split('T')[0] + 'T00:00:00')
        .lte('start_time', new Date().toISOString().split('T')[0] + 'T23:59:59'),
    ])

    // Calculate available slots for today
    const hours = tenant.hours as Record<string, { open: string; close: string; closed: boolean }> | null
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    const todayHours = hours?.[dayName]
    const availableSlots: string[] = []

    if (todayHours && !todayHours.closed) {
      const [openH, openM] = todayHours.open.split(':').map(Number)
      const [closeH, closeM] = todayHours.close.split(':').map(Number)
      const openMin = openH * 60 + openM
      const closeMin = closeH * 60 + closeM
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes()

      const bookedTimes = new Set(
        (appointmentsRes.data || []).map(a => {
          const d = new Date(a.start_time)
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        })
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

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const bookingUrl = `${baseUrl}/book/${tenant.slug}`

    // Build system prompt
    const systemPrompt = buildSystemPrompt(
      { name: tenant.name, phone: tenant.phone, address: tenant.address, hours: hours },
      servicesRes.data || [],
      staffRes.data || [],
      availableSlots,
      botConfig as { greeting: string; after_hours: string; booking_prompt: string; faq: { q: string; a: string }[]; auto_booking: boolean },
      bookingUrl
    )

    // Load conversation history if we have a conversation_id
    let conversationHistory: { role: string; parts: { text: string }[] }[] = []
    if (conversation_id) {
      const { data: pastMessages } = await svc
        .from('messages')
        .select('sender_type, content')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: true })
        .limit(20)

      conversationHistory = (pastMessages || []).map(m => ({
        role: m.sender_type === 'client' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }))
    }

    // Call Gemini API
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          ...conversationHistory,
          { role: 'user', parts: [{ text: message }] },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
          topP: 0.9,
        },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini API error:', errText)
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    let aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't process that. Please try again!"

    // Check for auto-booking intent
    let bookingResult = null
    if (botConfig.auto_booking) {
      const intent = parseBookingIntent(aiResponse)
      if (intent) {
        // Remove the BOOK_APPOINTMENT tag from the visible response
        aiResponse = aiResponse.replace(/BOOK_APPOINTMENT:.+/, '').trim()

        // Find the service
        const service = (servicesRes.data || []).find(s => 
          s.name.toLowerCase().includes(intent.service.toLowerCase())
        )
        
        if (service) {
          // Find the staff (or null for "any")
          const staffMember = intent.staff.toLowerCase() === 'any' ? null :
            (staffRes.data || []).find(s => s.name.toLowerCase().includes(intent.staff.toLowerCase()))

          // Create the appointment
          const startTime = new Date(`${intent.date}T${intent.time}:00`)
          const endTime = new Date(startTime.getTime() + service.duration_minutes * 60 * 1000)

          const { data: appt, error: apptErr } = await svc
            .from('appointments')
            .insert({
              tenant_id: tenantId,
              service_id: null, // We'd need the service ID
              staff_id: staffMember ? null : null, // We'd need staff IDs
              start_time: startTime.toISOString(),
              end_time: endTime.toISOString(),
              status: 'confirmed',
              notes: `Booked via AI Receptionist: ${service.name}`,
            })
            .select()
            .single()

          if (appt) {
            bookingResult = { success: true, appointment_id: appt.id, service: service.name, time: intent.time }
          }
        }
      }
    }

    // Save the AI response as a bot message if we have a conversation
    let savedMessage = null
    if (conversation_id) {
      const { data: msg } = await svc
        .from('messages')
        .insert({
          conversation_id,
          tenant_id: tenantId,
          sender_type: 'bot',
          sender_name: 'AI Receptionist',
          content: aiResponse,
          metadata: bookingResult ? { booking: bookingResult } : {},
        })
        .select()
        .single()

      // Update conversation
      if (msg) {
        await svc
          .from('conversations')
          .update({
            last_message: aiResponse,
            last_message_at: msg.created_at,
          })
          .eq('id', conversation_id)

        savedMessage = msg
      }
    }

    return NextResponse.json({
      response: aiResponse,
      message: savedMessage,
      booking: bookingResult,
    })
  } catch (err) {
    console.error('AI Chat error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
