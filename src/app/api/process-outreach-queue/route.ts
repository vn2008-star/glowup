import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronRequest } from '@/lib/cron-auth'
import { outreachReady, sendOutreachEmail, unsubscribedAmong } from '@/lib/outreach-send'

// ─── Outreach Queue Processor (Cron-triggered) ───
// Runs daily at 10 AM. Picks up to 95 queued outreach leads and sends them
// email 1 of the sequence (follow-ups go out from the admin Follow-Ups tab).
// This respects Resend's free tier limit of 100 emails/day.

const DAILY_LIMIT = 95

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
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [{ count: sentTodayCount }, { count: followUpsToday }] = await Promise.all([
    supabase.from('outreach_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', todayStart.toISOString()),
    supabase.from('outreach_campaigns').select('*', { count: 'exact', head: true }).gte('last_follow_up_at', todayStart.toISOString()),
  ])

  const sentToday = (sentTodayCount || 0) + (followUpsToday || 0)
  const canSend = Math.max(0, DAILY_LIMIT - sentToday)

  if (canSend === 0) {
    return NextResponse.json({
      message: 'Daily limit already reached',
      sent_today: sentToday,
      processed: 0,
    })
  }

  // Fetch queued leads (oldest first)
  const { data: queuedLeads } = await supabase
    .from('outreach_campaigns')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(canSend)

  if (!queuedLeads || queuedLeads.length === 0) {
    return NextResponse.json({
      message: 'No queued leads to process',
      sent_today: sentToday,
      processed: 0,
    })
  }

  // Unsubscribing also flips queued rows, but double-check at send time
  const unsubscribed = await unsubscribedAmong(supabase, queuedLeads.map(l => l.owner_email))

  let sent = 0
  let failed = 0

  const BATCH_SIZE = 10
  const BATCH_DELAY = 1000

  for (let i = 0; i < queuedLeads.length; i += BATCH_SIZE) {
    const batch = queuedLeads.slice(i, i + BATCH_SIZE)

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
    if (i + BATCH_SIZE < queuedLeads.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
    }
  }

  // Check remaining queue
  const { count: remainingQueued } = await supabase
    .from('outreach_campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued')

  return NextResponse.json({
    message: `Queue batch processed: ${sent} sent, ${failed} failed`,
    processed: sent + failed,
    sent,
    failed,
    remaining_queued: remainingQueued || 0,
    estimated_days_remaining: remainingQueued ? Math.ceil((remainingQueued || 0) / DAILY_LIMIT) : 0,
  })
}
