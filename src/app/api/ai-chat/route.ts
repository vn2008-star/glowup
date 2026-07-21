import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { handleAiChat, type TenantRow } from '@/lib/ai-receptionist'

// Web chat widget endpoint (public — the booking page's chat bubble).
// The heavy lifting lives in src/lib/ai-receptionist.ts, shared with the
// inbound-SMS webhook so both channels behave identically.
export async function POST(request: Request) {
  try {
    const { message, conversation_id, slug } = await request.json()

    if (!message || !slug) {
      return NextResponse.json({ error: 'Missing message or slug' }, { status: 400 })
    }

    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: tenant } = await svc
      .from('tenants')
      .select('id, name, slug, phone, email, address, timezone, settings')
      .eq('slug', slug)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const result = await handleAiChat({
      svc,
      tenant: tenant as TenantRow,
      message,
      conversationId: conversation_id || null,
      channel: 'web',
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      response: result.response,
      conversation_id: result.conversationId,
      message: result.savedMessage,
      booking: result.booking,
    })
  } catch (err) {
    console.error('AI Chat error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
