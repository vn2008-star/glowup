import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronRequest } from '@/lib/cron-auth'
import { DAILY_LIMIT, dueFollowUps, outreachReady, sendFollowUps, sendOutreachEmail, sentTodayCount, unsubscribedAmong } from '@/lib/outreach-send'

// ─── Outreach Queue Processor (Cron-triggered) ───
// Runs daily at 10 AM UTC. Sends the follow-ups that are due first (emails
// 2-4 of the sequence — without this they only went out when someone opened
// the admin Follow-Ups tab), then fills the rest of the day's 95 with email 1
// to queued leads. This respects Resend's free tier limit of 100 emails/day.

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
  let canSend = Math.max(0, DAILY_LIMIT - sentToday)

  if (canSend === 0) {
    return NextResponse.json({
      message: 'Daily limit already reached',
      sent_today: sentToday,
      processed: 0,
    })
  }

  // 1. Follow-ups first: they go to people who already heard from us, on a
  // schedule; new leads can wait a day without losing anything
  const followUps = await sendFollowUps(supabase, await dueFollowUps(supabase, canSend), canSend)
  const followUpsSent = followUps.filter(r => r.status === 'sent').length
  const followUpsFailed = followUps.filter(r => r.status === 'failed').length
  canSend -= followUpsSent

  // 2. Email 1 to queued leads (oldest first) with what's left
  const { data: queuedLeads } = canSend > 0
    ? await supabase
      .from('outreach_campaigns')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(canSend)
    : { data: [] }

  // Unsubscribing also flips queued rows, but double-check at send time
  const unsubscribed = await unsubscribedAmong(supabase, (queuedLeads || []).map(l => l.owner_email))

  let sent = 0
  let failed = 0

  const BATCH_SIZE = 10
  const BATCH_DELAY = 1000
  const leads = queuedLeads || []

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE)

    for (const lead of batch) {
      if (unsubscribed.has(String(lead.owner_email).toLowerCase())) {
        await supabase.from('outreach_campaigns').update({ status: 'unsubscribed' }).eq('id', lead.id)
        continue
      }

      const sendErr = await sendOutreachEmail({
        to: lead.owner_email,
        templateId: lead.template_id || 'intro',
        salonName: lead.salon_name,
        ownerName: lead.owner_name,
        referralCode: lead.referral_code,
      })
      if (sendErr) console.error(`Queue send failed for ${lead.owner_email}:`, sendErr)

      // Update status
      await supabase.from('outreach_campaigns')
        .update({
          status: sendErr ? 'failed' : 'sent',
          sent_at: sendErr ? null : new Date().toISOString(),
        })
        .eq('id', lead.id)

      if (sendErr) failed++
      else sent++
    }

    // Throttle between batches
    if (i + BATCH_SIZE < leads.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
    }
  }

  // Check remaining queue
  const { count: remainingQueued } = await supabase
    .from('outreach_campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued')

  return NextResponse.json({
    message: `Outreach processed: ${followUpsSent} follow-ups, ${sent} new leads sent, ${followUpsFailed + failed} failed`,
    processed: followUps.length + sent + failed,
    follow_ups_sent: followUpsSent,
    follow_ups_failed: followUpsFailed,
    sent,
    failed,
    remaining_queued: remainingQueued || 0,
    estimated_days_remaining: remainingQueued ? Math.ceil((remainingQueued || 0) / DAILY_LIMIT) : 0,
  })
}
