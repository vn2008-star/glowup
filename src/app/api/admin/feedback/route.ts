import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Verify the current user is a platform admin
async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, email: null } as const

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
  if (!adminEmails.includes(user.email?.toLowerCase() || '')) {
    return { user: null, email: user.email } as const
  }

  return { user, email: user.email } as const
}

// GET — list all feedback across all tenants
export async function GET(request: Request) {
  const auth = await verifyAdmin()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const type = url.searchParams.get('type')

  let query = svc
    .from('feedback')
    .select('*, staff:staff(name, email), tenant:tenants(name, slug)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && status !== 'all') query = query.eq('status', status)
  if (type && type !== 'all') query = query.eq('type', type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Counts by status
  const { data: allFb } = await svc
    .from('feedback')
    .select('status')

  const counts = { all: 0, new: 0, reviewed: 0, planned: 0, done: 0, dismissed: 0 }
  for (const f of (allFb || [])) {
    counts.all++
    const s = f.status as keyof typeof counts
    if (s in counts) counts[s]++
  }

  return NextResponse.json({ feedback: data || [], counts })
}

// POST — reply to / update feedback
export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { action, id, admin_notes, status } = await request.json()

  if (!id) return NextResponse.json({ error: 'Feedback id required' }, { status: 400 })

  if (action === 'reply') {
    // Save admin reply and mark as reviewed
    const updates: Record<string, unknown> = {
      admin_notes: admin_notes || '',
      reviewed_at: new Date().toISOString(),
    }
    if (status) updates.status = status
    else updates.status = 'reviewed'

    const { data, error } = await svc
      .from('feedback')
      .update(updates)
      .eq('id', id)
      .select('*, staff:staff(name, email), tenant:tenants(name, slug)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ feedback: data })
  }

  if (action === 'update-status') {
    const updates: Record<string, unknown> = { status }
    if (status === 'reviewed' || status === 'planned' || status === 'done' || status === 'dismissed') {
      updates.reviewed_at = new Date().toISOString()
    }

    const { data, error } = await svc
      .from('feedback')
      .update(updates)
      .eq('id', id)
      .select('*, staff:staff(name, email), tenant:tenants(name, slug)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ feedback: data })
  }

  if (action === 'delete') {
    const { error } = await svc
      .from('feedback')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
