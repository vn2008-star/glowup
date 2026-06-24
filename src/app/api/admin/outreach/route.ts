import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { renderTemplate, TEMPLATES, TemplateId, renderSmsTemplate, SMS_TEMPLATES, SmsTemplateId } from '@/lib/outreach-templates'

const DAILY_LIMIT = 95 // Leave 5 buffer for follow-ups within Resend's 100/day free tier
const SMS_BATCH_LIMIT = 200 // SMS batch limit per run

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

// Helper: count how many outreach emails we've sent today
async function getSentTodayCount(svc: ReturnType<typeof getSvc>) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count } = await svc
    .from('outreach_campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', todayStart.toISOString())

  return count || 0
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
    return NextResponse.json({ templates: Object.values(TEMPLATES) })
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

    // Get already-contacted emails to exclude duplicates
    const { data: contacted } = await svc
      .from('outreach_campaigns')
      .select('owner_email')
      .in('status', ['sent', 'queued', 'skipped_active'])

    const contactedEmails = new Set((contacted || []).map(c => c.owner_email?.toLowerCase()))

    // Map leads to outreach format, filtering out already-contacted
    const leads = (rawLeads || [])
      .filter(l => l.email && !contactedEmails.has(l.email.toLowerCase()))
      .map(l => ({
        salon_name: l.business_name || 'Unknown Salon',
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
      ready_to_send: leads.length,
    })
  }

  // Load phone-ready leads from the InfoIQ `leads` table (for SMS outreach)
  if (action === 'load-sms-leads') {
    // Get all leads with phone numbers
    const { data: rawLeads, error: leadsErr } = await svc
      .from('leads')
      .select('business_name, email, phone, city, state, rating, review_count')
      .not('phone', 'is', null)
      .order('created_at', { ascending: false })

    if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 })

    // Get already-contacted phones to exclude duplicates
    const { data: contacted } = await svc
      .from('outreach_campaigns')
      .select('phone')
      .eq('channel', 'sms')
      .in('status', ['sent', 'queued', 'skipped_active'])

    const contactedPhones = new Set((contacted || []).map(c => c.phone?.replace(/\D/g, '')))

    // Map leads to outreach format, filtering out already-contacted
    const leads = (rawLeads || [])
      .filter(l => {
        if (!l.phone) return false
        const normalized = l.phone.replace(/\D/g, '')
        if (normalized.length < 10) return false
        return !contactedPhones.has(normalized)
      })
      .map(l => ({
        salon_name: l.business_name || 'Unknown Salon',
        owner_name: l.business_name || 'Salon Owner',
        owner_email: l.email || '',
        phone: l.phone,
        city: l.city || undefined,
        state: l.state || undefined,
        rating: l.rating,
        review_count: l.review_count,
      }))

    return NextResponse.json({
      leads,
      total_in_db: rawLeads?.length || 0,
      already_contacted: contactedPhones.size,
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

    const sentToday = await getSentTodayCount(svc)
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

  // Return follow-up candidates (sent 7+ days ago, no signup, not yet followed up to max)
  if (action === 'follow-up-candidates') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    const { data } = await svc
      .from('outreach_campaigns')
      .select('*')
      .eq('status', 'sent')
      .eq('signed_up', false)
      .lt('sent_at', sevenDaysAgo)
      .lt('follow_up_count', 2) // Max 2 follow-ups
      .order('sent_at', { ascending: true })
      .limit(200)

    return NextResponse.json({ candidates: data || [] })
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

  // Handle auto follow-ups
  if (action === 'send-follow-ups') {
    return handleFollowUps(body)
  }

  // Handle bulk SMS send
  if (action === 'send-sms') {
    return handleBulkSms(body)
  }

  // Regular bulk email send
  return handleBulkSend(body)
}

async function handleBulkSend(body: {
  leads: Array<{ salon_name: string; owner_name: string; owner_email: string; phone?: string; city?: string; state?: string }>;
  senderName?: string;
  senderEmail?: string;
  templateId?: TemplateId;
}) {
  const { leads, senderName, senderEmail, templateId = 'feature_showcase' } = body

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: 'No leads provided' }, { status: 400 })
  }

  const svc = getSvc()

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const genCode = () => 'CR-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  const template = TEMPLATES[templateId] || TEMPLATES.feature_showcase

  // Check how many we can send today
  const sentToday = await getSentTodayCount(svc)
  let remainingToday = Math.max(0, DAILY_LIMIT - sentToday)

  const results: Array<{
    salon_name: string; owner_name: string; owner_email: string;
    status: string; code?: string; error?: string;
  }> = []

  const BATCH_SIZE = 10
  const BATCH_DELAY = 1000

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE)

    for (const lead of batch) {
      const { salon_name, owner_name, owner_email, phone, city, state } = lead

      if (!salon_name || !owner_name || !owner_email) {
        results.push({ salon_name, owner_name, owner_email, status: 'skipped', error: 'Missing required fields' })
        continue
      }

      const email = owner_email.trim().toLowerCase()

      // 1. Check if already on GlowUp
      const { data: existingOwner } = await svc
        .from('staff')
        .select('id')
        .eq('role', 'owner')
        .ilike('email', email)
        .single()

      if (existingOwner) {
        await svc.from('outreach_campaigns').insert({
          salon_name: salon_name.trim(), owner_name: owner_name.trim(), owner_email: email,
          phone: phone?.trim() || null, city: city?.trim() || null, state: state?.trim() || null,
          status: 'skipped_active', referral_code: null, template_id: templateId,
        })
        results.push({ salon_name, owner_name, owner_email: email, status: 'skipped_active' })
        continue
      }

      // 2. Check if already contacted or queued
      const { data: existingOutreach } = await svc
        .from('outreach_campaigns')
        .select('id')
        .eq('owner_email', email)
        .in('status', ['sent', 'skipped_active', 'queued'])
        .single()

      if (existingOutreach) {
        results.push({ salon_name, owner_name, owner_email: email, status: 'skipped_duplicate' })
        continue
      }

      // 3. Generate referral code
      const code = genCode()

      await svc.from('client_referral_codes').insert({
        code,
        referrer_name: senderName || 'GlowUp Team',
        referrer_email: senderEmail || 'outreach@glowup.com',
        referred_salon_name: salon_name.trim(),
        referred_owner_name: owner_name.trim(),
        referred_owner_email: email,
      })

      // 4. Check daily limit — queue if exceeded
      if (remainingToday <= 0) {
        // Queue for later sending
        await svc.from('outreach_campaigns').insert({
          salon_name: salon_name.trim(), owner_name: owner_name.trim(), owner_email: email,
          phone: phone?.trim() || null, city: city?.trim() || null, state: state?.trim() || null,
          referral_code: code, template_id: templateId, follow_up_count: 0,
          status: 'queued',
          sender_name: senderName?.trim() || null,
          sender_email: senderEmail?.trim() || null,
        })
        results.push({ salon_name, owner_name, owner_email: email, status: 'queued', code })
        continue
      }

      // 5. Send email using template
      const signupLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup?cref=${code}`
      const htmlContent = renderTemplate(templateId, salon_name, owner_name, signupLink, senderName)

      let emailSent = false
      try {
        if (process.env.RESEND_API_KEY) {
          const { Resend } = await import('resend')
          const resend = new Resend(process.env.RESEND_API_KEY)

          const fromLine = senderName
            ? `${senderName} via GlowUp <bookings@joinglowup.org>`
            : 'GlowUp Team <bookings@joinglowup.org>'

          await resend.emails.send({
            from: fromLine,
            to: [email],
            subject: template.subjectFn(salon_name.trim()),
            html: htmlContent,
          })
          emailSent = true
          remainingToday--
        } else {
          console.log(`[DRY RUN] Outreach email to ${email} for ${salon_name} (template: ${templateId})`)
          emailSent = true
          remainingToday--
        }
      } catch (emailErr) {
        console.error(`Failed to send outreach email to ${email}:`, emailErr)
      }

      // 6. Record in outreach_campaigns
      await svc.from('outreach_campaigns').insert({
        salon_name: salon_name.trim(), owner_name: owner_name.trim(), owner_email: email,
        phone: phone?.trim() || null, city: city?.trim() || null, state: state?.trim() || null,
        referral_code: code, template_id: templateId, follow_up_count: 0,
        status: emailSent ? 'sent' : 'failed',
        sent_at: emailSent ? new Date().toISOString() : null,
      })

      results.push({ salon_name, owner_name, owner_email: email, status: emailSent ? 'sent' : 'failed', code })
    }

    if (i + BATCH_SIZE < leads.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
    }
  }

  const sent = results.filter(r => r.status === 'sent').length
  const queued = results.filter(r => r.status === 'queued').length
  const skipped = results.filter(r => r.status.startsWith('skipped')).length
  const failed = results.filter(r => r.status === 'failed').length

  return NextResponse.json({
    summary: { total: results.length, sent, queued, skipped, failed },
    results,
  })
}

async function handleFollowUps(body: { senderName?: string; campaignIds?: string[] }) {
  const { senderName, campaignIds } = body
  const svc = getSvc()

  // Get candidates — either specific IDs or auto-detect
  let candidates
  if (campaignIds && campaignIds.length > 0) {
    const { data } = await svc
      .from('outreach_campaigns')
      .select('*')
      .in('id', campaignIds)
      .eq('signed_up', false)
    candidates = data || []
  } else {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data } = await svc
      .from('outreach_campaigns')
      .select('*')
      .eq('status', 'sent')
      .eq('signed_up', false)
      .lt('sent_at', sevenDaysAgo)
      .lt('follow_up_count', 2)
      .order('sent_at', { ascending: true })
      .limit(50)
    candidates = data || []
  }

  if (candidates.length === 0) {
    return NextResponse.json({ summary: { total: 0, sent: 0, skipped: 0, failed: 0 }, results: [] })
  }

  // Follow-up sequence: 1st follow-up → success_story, 2nd → follow_up template
  const templateSequence: TemplateId[] = ['success_story', 'follow_up']

  const results: Array<{ salon_name: string; owner_email: string; status: string; template: string }> = []

  // Respect daily limit for follow-ups too
  const sentToday = await getSentTodayCount(svc)
  let remainingToday = Math.max(0, DAILY_LIMIT - sentToday)

  const BATCH_SIZE = 10
  const BATCH_DELAY = 1000

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE)

    for (const campaign of batch) {
      if (remainingToday <= 0) {
        results.push({
          salon_name: campaign.salon_name,
          owner_email: campaign.owner_email,
          status: 'queued',
          template: 'deferred',
        })
        continue
      }

      const followUpIdx = Math.min(campaign.follow_up_count || 0, templateSequence.length - 1)
      const templateId = templateSequence[followUpIdx]
      const template = TEMPLATES[templateId]

      const signupLink = campaign.referral_code
        ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup?cref=${campaign.referral_code}`
        : `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup`

      const htmlContent = renderTemplate(templateId, campaign.salon_name, campaign.owner_name, signupLink, senderName)

      let emailSent = false
      try {
        if (process.env.RESEND_API_KEY) {
          const { Resend } = await import('resend')
          const resend = new Resend(process.env.RESEND_API_KEY)

          await resend.emails.send({
            from: senderName
              ? `${senderName} via GlowUp <bookings@joinglowup.org>`
              : 'GlowUp Team <bookings@joinglowup.org>',
            to: [campaign.owner_email],
            subject: template.subjectFn(campaign.salon_name),
            html: htmlContent,
          })
          emailSent = true
          remainingToday--
        } else {
          console.log(`[DRY RUN] Follow-up to ${campaign.owner_email} (template: ${templateId})`)
          emailSent = true
          remainingToday--
        }
      } catch (err) {
        console.error(`Follow-up failed for ${campaign.owner_email}:`, err)
      }

      if (emailSent) {
        // Update the campaign record
        await svc.from('outreach_campaigns')
          .update({
            follow_up_count: (campaign.follow_up_count || 0) + 1,
            last_follow_up_at: new Date().toISOString(),
            last_template_id: templateId,
          })
          .eq('id', campaign.id)
      }

      results.push({
        salon_name: campaign.salon_name,
        owner_email: campaign.owner_email,
        status: emailSent ? 'sent' : 'failed',
        template: templateId,
      })
    }

    if (i + BATCH_SIZE < candidates.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
    }
  }

  return NextResponse.json({
    summary: {
      total: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      skipped: 0,
      failed: results.filter(r => r.status === 'failed').length,
    },
    results,
  })
}

async function handleBulkSms(body: {
  leads: Array<{ salon_name: string; phone: string; city?: string; state?: string }>;
  smsTemplateId?: SmsTemplateId;
  batchSize?: number;
}) {
  const { leads, smsTemplateId = 'sms_intro', batchSize } = body

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: 'No leads provided' }, { status: 400 })
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER

  if (!twilioSid || !twilioAuth || !twilioFrom) {
    return NextResponse.json({ error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.' }, { status: 500 })
  }

  const svc = getSvc()
  const maxToSend = batchSize || SMS_BATCH_LIMIT

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const genCode = () => 'CR-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  const results: Array<{
    salon_name: string; phone: string;
    status: string; code?: string; error?: string;
  }> = []

  let sentCount = 0
  const BATCH_SIZE = 10
  const BATCH_DELAY = 1500 // Slightly slower for SMS

  for (let i = 0; i < leads.length && sentCount < maxToSend; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE)

    for (const lead of batch) {
      if (sentCount >= maxToSend) {
        results.push({ salon_name: lead.salon_name, phone: lead.phone, status: 'queued' })
        continue
      }

      const { salon_name, phone } = lead
      if (!salon_name || !phone) {
        results.push({ salon_name, phone, status: 'skipped', error: 'Missing required fields' })
        continue
      }

      // Normalize phone number
      let normalizedPhone = phone.replace(/\D/g, '')
      if (normalizedPhone.length === 10) normalizedPhone = '1' + normalizedPhone
      if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone

      // Check if already contacted via SMS
      const { data: existing } = await svc
        .from('outreach_campaigns')
        .select('id')
        .eq('channel', 'sms')
        .eq('phone', normalizedPhone)
        .in('status', ['sent', 'queued'])
        .single()

      if (existing) {
        results.push({ salon_name, phone, status: 'skipped_duplicate' })
        continue
      }

      // Generate referral code
      const code = genCode()
      const signupLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup?cref=${code}`
      const smsBody = renderSmsTemplate(smsTemplateId, salon_name.trim(), signupLink)

      // Save referral code
      await svc.from('client_referral_codes').insert({
        code,
        referrer_name: 'GlowUp SMS',
        referrer_email: 'sms-outreach@glowup.com',
        referred_salon_name: salon_name.trim(),
        referred_owner_name: salon_name.trim(),
        referred_owner_email: '',
      })

      // Send SMS via Twilio
      let smsSent = false
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`
        const twilioBody = new URLSearchParams({
          To: normalizedPhone,
          From: twilioFrom,
          Body: smsBody,
        })

        const twilioRes = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: twilioBody.toString(),
        })

        if (twilioRes.ok) {
          smsSent = true
          sentCount++
        } else {
          const errData = await twilioRes.json()
          console.error(`SMS to ${normalizedPhone} failed:`, errData.message || errData)
          results.push({ salon_name, phone, status: 'failed', error: errData.message || 'Twilio error' })

          // Still record in DB
          await svc.from('outreach_campaigns').insert({
            salon_name: salon_name.trim(), owner_name: salon_name.trim(), owner_email: '',
            phone: normalizedPhone, city: lead.city?.trim() || null, state: lead.state?.trim() || null,
            referral_code: code, template_id: smsTemplateId, channel: 'sms',
            status: 'failed', follow_up_count: 0,
          })
          continue
        }
      } catch (err) {
        console.error(`SMS to ${normalizedPhone} error:`, err)
        results.push({ salon_name, phone, status: 'failed', error: 'Network error' })
        continue
      }

      // Record success in outreach_campaigns
      await svc.from('outreach_campaigns').insert({
        salon_name: salon_name.trim(), owner_name: salon_name.trim(), owner_email: '',
        phone: normalizedPhone, city: lead.city?.trim() || null, state: lead.state?.trim() || null,
        referral_code: code, template_id: smsTemplateId, channel: 'sms',
        status: 'sent', sent_at: new Date().toISOString(), follow_up_count: 0,
      })

      results.push({ salon_name, phone, status: 'sent', code })
    }

    if (i + BATCH_SIZE < leads.length && sentCount < maxToSend) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
    }
  }

  // Add remaining as queued
  const remaining = leads.slice(results.length)
  for (const lead of remaining) {
    results.push({ salon_name: lead.salon_name, phone: lead.phone, status: 'queued' })
  }

  const sent = results.filter(r => r.status === 'sent').length
  const queued = results.filter(r => r.status === 'queued').length
  const skipped = results.filter(r => r.status.startsWith('skipped')).length
  const failed = results.filter(r => r.status === 'failed').length

  return NextResponse.json({
    summary: { total: results.length, sent, queued, skipped, failed },
    results,
  })
}
