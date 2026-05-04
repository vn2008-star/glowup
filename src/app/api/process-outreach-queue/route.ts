import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderTemplate, TEMPLATES, TemplateId } from '@/lib/outreach-templates'

// ─── Outreach Queue Processor (Cron-triggered) ───
// Runs daily at 10 AM. Picks up to 95 queued outreach leads and sends them.
// This respects Resend's free tier limit of 100 emails/day.

const DAILY_LIMIT = 95

export async function GET(request: Request) {
  // Auth: only allow Vercel Cron or manual call with CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check how many we've already sent today (in case manual sends happened)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count: sentTodayCount } = await supabase
    .from('outreach_campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', todayStart.toISOString())

  const sentToday = sentTodayCount || 0
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

  let sent = 0
  let failed = 0

  const BATCH_SIZE = 10
  const BATCH_DELAY = 1000

  for (let i = 0; i < queuedLeads.length; i += BATCH_SIZE) {
    const batch = queuedLeads.slice(i, i + BATCH_SIZE)

    for (const lead of batch) {
      const templateId = (lead.template_id || 'feature_showcase') as TemplateId
      const template = TEMPLATES[templateId] || TEMPLATES.feature_showcase
      const senderName = lead.sender_name || undefined

      const signupLink = lead.referral_code
        ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup?cref=${lead.referral_code}`
        : `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup`

      const htmlContent = renderTemplate(
        templateId,
        lead.salon_name,
        lead.owner_name,
        signupLink,
        senderName,
      )

      let emailSent = false
      try {
        if (process.env.RESEND_API_KEY) {
          const { Resend } = await import('resend')
          const resend = new Resend(process.env.RESEND_API_KEY)

          const fromLine = senderName
            ? `${senderName} via GlowUp <onboarding@resend.dev>`
            : 'GlowUp Team <onboarding@resend.dev>'

          await resend.emails.send({
            from: fromLine,
            to: [lead.owner_email],
            subject: template.subjectFn(lead.salon_name),
            html: htmlContent,
          })
          emailSent = true
        } else {
          console.log(`[DRY RUN] Queue send to ${lead.owner_email} (template: ${templateId})`)
          emailSent = true
        }
      } catch (err) {
        console.error(`Queue send failed for ${lead.owner_email}:`, err)
      }

      // Update status
      await supabase.from('outreach_campaigns')
        .update({
          status: emailSent ? 'sent' : 'failed',
          sent_at: emailSent ? new Date().toISOString() : null,
        })
        .eq('id', lead.id)

      if (emailSent) sent++
      else failed++
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
