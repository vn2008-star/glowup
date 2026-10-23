import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronRequest } from '@/lib/cron-auth'
import {
  DAILY_LIMIT, dueFollowUps, followUpEmail, markFollowUpsSent, outreachReady, sendOutreachBatch,
  sentTodayCount, undeliverableDomains, unsubscribedAmong, type OutreachEmail,
} from '@/lib/outreach-send'

// ─── Outreach Queue Processor (Cron-triggered) ───
// Runs daily at 10 AM UTC and is the only place outreach goes out in bulk.
// Follow-ups that are due go first (emails 2-4: they're to people who already
// heard from us, on a schedule), then email 1 to queued leads fills the rest
// of the day's 95 — Resend's free tier is 100/day.
//
// Everything goes in ONE Resend batch request, so there's no per-second rate
// limit to trip and it finishes well inside the function's time limit. If the
// batch fails as a whole, nothing is marked and it all goes again tomorrow.

export const maxDuration = 60

export async function GET(request: Request) {
  // Auth: only allow Vercel Cron or manual call with CRON_SECRET
  const unauthorized = verifyCronRequest(request)
  if (unauthorized) return unauthorized

  // No mailing address yet → nothing may go out; the queue just waits
  if (!outreachReady()) {
    return NextResponse.json({ message: 'Outreach paused: no mailing address configured', processed: 0 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check how many we've already sent today (in case manual sends happened)
  const sentToday = await sentTodayCount(supabase)
  const canSend = Math.max(0, DAILY_LIMIT - sentToday)

  if (canSend === 0) {
    return NextResponse.json({
      message: 'Daily limit already reached',
      sent_today: sentToday,
      processed: 0,
    })
  }

  // 1. Follow-ups that are due
  const followUps = await dueFollowUps(supabase, canSend)

  // 2. Queued leads, oldest first. Only ones queued before today (UTC): a
  // list uploaded today starts with tomorrow's run, so it never lands on top
  // of that day's test or manual sends and runs past Resend's daily limit.
  const todayStartUtc = new Date()
  todayStartUtc.setUTCHours(0, 0, 0, 0)
  const room = canSend - followUps.length
  const { data: queuedRows } = room > 0
    ? await supabase
      .from('outreach_campaigns')
      .select('*')
      .eq('status', 'queued')
      .lt('created_at', todayStartUtc.toISOString())
      .order('created_at', { ascending: true })
      // A few extra to cover the ones dropped below
      .limit(room + 30)
    : { data: [] }
  const queued = queuedRows || []

  // Unsubscribing also flips queued rows, but double-check at send time;
  // and skip domains that can't receive mail (typos like gmai.com, dead
  // domains) — bounces hurt bookings@joinglowup.org for every salon
  const [unsubscribed, badDomains] = await Promise.all([
    unsubscribedAmong(supabase, queued.map(l => l.owner_email)),
    undeliverableDomains(queued.map(l => l.owner_email)),
  ])
  const unsubIds: string[] = [], badIds: string[] = []
  const firsts: typeof queued = []
  for (const lead of queued) {
    const email = String(lead.owner_email).toLowerCase()
    if (unsubscribed.has(email)) unsubIds.push(lead.id)
    else if (badDomains.has(email.split('@')[1])) badIds.push(lead.id)
    else if (firsts.length < room) firsts.push(lead)
  }
  if (unsubIds.length) await supabase.from('outreach_campaigns').update({ status: 'unsubscribed' }).in('id', unsubIds)
  if (badIds.length) await supabase.from('outreach_campaigns').update({ status: 'undeliverable' }).in('id', badIds)

  // 3. One batch: follow-ups, then first emails
  const emails: OutreachEmail[] = [
    ...followUps.map(c => followUpEmail(c)),
    ...firsts.map(l => ({ to: l.owner_email, templateId: l.template_id || 'intro', salonName: l.salon_name, ownerName: l.owner_name, referralCode: l.referral_code })),
  ]
  const result = await sendOutreachBatch(emails)
  if ('error' in result) {
    console.error('Outreach batch failed:', result.error)
    return NextResponse.json({ message: `Outreach batch failed, will retry tomorrow: ${result.error}`, processed: 0 }, { status: 502 })
  }
  const failedIdx = result.failed
  for (const [i, msg] of failedIdx) console.error(`Outreach send failed for ${emails[i].to}:`, msg)

  // 4. Record what went out
  const followUpsSent = followUps.filter((_, i) => !failedIdx.has(i))
  await markFollowUpsSent(supabase, followUpsSent)

  const offset = followUps.length
  const sentIds = firsts.filter((_, i) => !failedIdx.has(offset + i)).map(l => l.id)
  const failedIds = firsts.filter((_, i) => failedIdx.has(offset + i)).map(l => l.id)
  if (sentIds.length) await supabase.from('outreach_campaigns').update({ status: 'sent', sent_at: new Date().toISOString() }).in('id', sentIds)
  if (failedIds.length) await supabase.from('outreach_campaigns').update({ status: 'failed' }).in('id', failedIds)

  // Check remaining queue
  const { count: remainingQueued } = await supabase
    .from('outreach_campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued')

  return NextResponse.json({
    message: `Outreach processed: ${followUpsSent.length} follow-ups, ${sentIds.length} new leads, ${failedIdx.size} failed, ${badIds.length} undeliverable`,
    processed: emails.length,
    follow_ups_sent: followUpsSent.length,
    sent: sentIds.length,
    failed: failedIdx.size,
    undeliverable: badIds.length,
    remaining_queued: remainingQueued || 0,
    estimated_days_remaining: remainingQueued ? Math.ceil((remainingQueued || 0) / DAILY_LIMIT) : 0,
  })
}
