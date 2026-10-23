import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { TEMPLATES, SMS_TEMPLATES, OUTREACH_SENDER_NAME } from '@/lib/outreach-templates'
import { CONTACTED_STATUSES, DAILY_LIMIT, MISSING_ADDRESS_ERROR, dueFollowUps, junkEmails, outreachReady, sendFollowUps, sentTodayCount } from '@/lib/outreach-send'

// ─── Admin bulk outreach ───
// New leads are only queued here; the daily cron (process-outreach-queue)
// sends email 1 to them and emails 2-4 once enough days have passed
// (FOLLOW_UP_SEQUENCE), 95 a day in all. The Follow-Ups tab can send due
// follow-ups early.
// Texts are not sent from here: cold marketing texts need prior consent, and
// our Twilio number doesn't deliver — the SMS tab builds texts for the admin
// to send from their own phone.

export const maxDuration = 60

// Verify the current user is a platform admin
async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
  if (!adminEmails.includes(user.email?.toLowerCase() || '')) return null

  return user
}

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET — list past outreach campaigns
export async function GET(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized', your_email: '' }, { status: 403 })

  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  const svc = getSvc()

  // Return template list
  if (action === 'templates') {
    return NextResponse.json({ templates: Object.values(TEMPLATES), ready: outreachReady(), not_ready_reason: outreachReady() ? null : MISSING_ADDRESS_ERROR })
  }

  // Load email-ready leads from the InfoIQ `leads` table
  if (action === 'load-leads') {
    // Get all leads with emails
    const { data: rawLeads, error: leadsErr } = await svc
      .from('leads')
      .select('business_name, email, phone, city, state, rating, review_count')
      .not('email', 'is', null)
      .order('created_at', { ascending: false })

    if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 })

    // Already contacted, queued, on GlowUp, or unsubscribed
    const { data: contacted } = await svc
      .from('outreach_campaigns')
      .select('owner_email')
      .in('status', CONTACTED_STATUSES)

    const contactedEmails = new Set((contacted || []).map(c => c.owner_email?.toLowerCase()))

    // Website placeholders and vendor addresses scraped off salon sites
    const junk = junkEmails((rawLeads || []).map(l => ({ salon_name: l.business_name, owner_email: l.email })))
    const seen = new Set<string>()

    // Map leads to outreach format: one row per address, not contacted, not junk
    const leads = (rawLeads || [])
      .filter(l => {
        const e = l.email?.trim().toLowerCase()
        if (!e || contactedEmails.has(e) || junk.has(e) || seen.has(e)) return false
        seen.add(e)
        return true
      })
      .map(l => ({
        salon_name: l.business_name || 'Unknown Salon',
        // The leads table has no person's name; the email greets "Hi there"
        owner_name: l.business_name || 'Salon Owner',
        owner_email: l.email,
        phone: l.phone || undefined,
        city: l.city || undefined,
        state: l.state || undefined,
        rating: l.rating,
        review_count: l.review_count,
      }))

    return NextResponse.json({
      leads,
      total_in_db: rawLeads?.length || 0,
      already_contacted: contactedEmails.size,
      junk: junk.size,
      ready_to_send: leads.length,
    })
  }

  // Return SMS template list
  if (action === 'sms-templates') {
    return NextResponse.json({ templates: Object.values(SMS_TEMPLATES) })
  }

  // Return queue stats
  if (action === 'queue-stats') {
    const { count: queuedCount } = await svc
      .from('outreach_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued')

    const sentToday = await sentTodayCount(svc)
    const remaining = Math.max(0, DAILY_LIMIT - sentToday)

    const { count: totalSent } = await svc
      .from('outreach_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')

    return NextResponse.json({
      queued: queuedCount || 0,
      sent_today: sentToday,
      daily_limit: DAILY_LIMIT,
      remaining_today: remaining,
      total_sent: totalSent || 0,
      estimated_days: queuedCount ? Math.ceil((queuedCount || 0) / DAILY_LIMIT) : 0,
    })
  }

  if (action === 'follow-up-candidates') {
    return NextResponse.json({ candidates: await dueFollowUps(svc, 200) })
  }

  const { data, error } = await svc
    .from('outreach_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ campaigns: data || [] })
}

// POST — send bulk outreach or follow-ups
export async function POST(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await request.json()
  const { action } = body

  if (action === 'send-sms') {
    return NextResponse.json({ error: 'Bulk texting is turned off — send texts from your own phone on the SMS tab, only to people who replied or asked to be texted.' }, { status: 410 })
  }

  if (!outreachReady()) return NextResponse.json({ error: MISSING_ADDRESS_ERROR }, { status: 400 })

  // Handle follow-ups
  if (action === 'send-follow-ups') {
    return handleFollowUps(body)
  }

  // Regular bulk email send
  return handleBulkSend(body)
}

async function handleBulkSend(body: {
  leads: Array<{ salon_name: string; owner_name: string; owner_email: string; phone?: string; city?: string; state?: string }>;
  senderName?: string;
  senderEmail?: string;
}) {
  const { leads, senderName, senderEmail } = body
  // New leads always start the sequence at email 1; 2-4 go out as follow-ups
  const templateId = 'intro'

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: 'No leads provided' }, { status: 400 })
  }

  const svc = getSvc()

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const genCode = () => 'CR-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  // Look every address up in bulk. One query per lead (the old way) took
  // ~4 round trips each, so a 14,000-row upload ran far past the function's
  // time limit and everything after the cut-off was never queued.
  const allEmails = [...new Set(leads.map(l => String(l.owner_email || '').trim().toLowerCase()).filter(Boolean))]
  const activeOwners = new Set<string>()
  const contacted = new Map<string, string>()
  for (let i = 0; i < allEmails.length; i += 300) {
    const chunk = allEmails.slice(i, i + 300)
    const [{ data: owners }, { data: rows }] = await Promise.all([
      svc.from('staff').select('email').eq('role', 'owner').in('email', chunk),
      svc.from('outreach_campaigns').select('owner_email, status').in('owner_email', chunk).in('status', CONTACTED_STATUSES),
    ])
    for (const o of owners || []) activeOwners.add(String(o.email).toLowerCase())
    for (const r of rows || []) {
      const e = String(r.owner_email).toLowerCase()
      // unsubscribed wins over any other status for the same address
      if (contacted.get(e) !== 'unsubscribed') contacted.set(e, r.status)
    }
  }

  const junk = junkEmails(leads)

  const results: Array<{
    salon_name: string; owner_name: string; owner_email: string;
    status: string; code?: string; error?: string;
  }> = []
  const campaignRows: Record<string, unknown>[] = []
  const referralRows: Record<string, unknown>[] = []
  const seen = new Set<string>()

  for (const lead of leads) {
    const { salon_name, owner_name, owner_email, phone, city, state } = lead
    if (!salon_name || !owner_email) {
      results.push({ salon_name, owner_name, owner_email, status: 'skipped', error: 'Missing required fields' })
      continue
    }
    const email = owner_email.trim().toLowerCase()
    const ownerName = (owner_name || '').trim()
    const base = {
      salon_name: salon_name.trim(), owner_name: ownerName, owner_email: email,
      phone: phone?.trim() || null, city: city?.trim() || null, state: state?.trim() || null,
    }

    // Same address twice in this upload
    if (seen.has(email)) { results.push({ salon_name, owner_name, owner_email: email, status: 'skipped_duplicate' }); continue }
    seen.add(email)

    // 1. Already on GlowUp
    if (activeOwners.has(email)) {
      campaignRows.push({ ...base, status: 'skipped_active', referral_code: null, template_id: templateId })
      results.push({ salon_name, owner_name, owner_email: email, status: 'skipped_active' })
      continue
    }

    // 2. Already contacted, queued or unsubscribed
    const prior = contacted.get(email)
    if (prior) {
      results.push({ salon_name, owner_name, owner_email: email, status: prior === 'unsubscribed' ? 'skipped_unsubscribed' : 'skipped_duplicate' })
      continue
    }

    // 3. Website placeholder or a vendor's address, not the salon's
    const junkReason = junk.get(email)
    if (junkReason) {
      results.push({ salon_name, owner_name, owner_email: email, status: 'skipped_junk', error: junkReason })
      continue
    }

    // 4. Referral code — ties a signup back to this email
    const code = genCode()
    referralRows.push({
      code,
      referrer_name: senderName || OUTREACH_SENDER_NAME,
      referrer_email: senderEmail || 'outreach@glowup.com',
      referred_salon_name: base.salon_name,
      referred_owner_name: ownerName,
      referred_owner_email: email,
    })

    // 5. Queue it. Sending happens only in the daily cron: sending here meant
    // 95 emails one by one inside a 60-second request, with the record of
    // who got one written at the end, so a timeout lost track of them all.
    // The table has no sender_name column; queued emails are signed
    // OUTREACH_SENDER_NAME.
    campaignRows.push({ ...base, referral_code: code, template_id: templateId, follow_up_count: 0, status: 'queued' })
    results.push({ salon_name, owner_name, owner_email: email, status: 'queued', code })
  }

  // 6. Record everything in bulk
  const insertErrors: string[] = []
  for (let i = 0; i < referralRows.length; i += 500) {
    const { error } = await svc.from('client_referral_codes').insert(referralRows.slice(i, i + 500))
    if (error) insertErrors.push(`referral codes: ${error.message}`)
  }
  for (let i = 0; i < campaignRows.length; i += 500) {
    const { error } = await svc.from('outreach_campaigns').insert(campaignRows.slice(i, i + 500))
    if (error) insertErrors.push(`campaign log: ${error.message}`)
  }

  const sent = results.filter(r => r.status === 'sent').length
  const queued = results.filter(r => r.status === 'queued').length
  const skipped = results.filter(r => r.status.startsWith('skipped')).length
  const failed = results.filter(r => r.status === 'failed').length

  return NextResponse.json({
    summary: { total: results.length, sent, queued, skipped, failed },
    // Results for 14,000 rows is a lot to ship back; the summary carries the totals
    results: results.slice(0, 2000),
    ...(insertErrors.length ? { error: `Some records weren't saved — ${insertErrors.join('; ')}` } : {}),
  })
}

async function handleFollowUps(body: { senderName?: string; campaignIds?: string[] }) {
  const { senderName, campaignIds } = body
  const svc = getSvc()

  // Re-checked here, not trusted from the client: due, not signed up, not unsubscribed
  const candidates = await dueFollowUps(svc, 200, campaignIds)

  if (candidates.length === 0) {
    return NextResponse.json({ summary: { total: 0, sent: 0, skipped: 0, failed: 0 }, results: [] })
  }

  // Respect daily limit for follow-ups too
  const remainingToday = Math.max(0, DAILY_LIMIT - await sentTodayCount(svc))
  const results = await sendFollowUps(svc, candidates, remainingToday, senderName)

  return NextResponse.json({
    summary: {
      total: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      skipped: results.filter(r => r.status === 'deferred').length,
      failed: results.filter(r => r.status === 'failed').length,
    },
    results,
  })
}
