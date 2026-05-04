import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { renderTemplate, TEMPLATES, TemplateId } from '@/lib/outreach-templates'

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
    return NextResponse.json({ templates: Object.values(TEMPLATES) })
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

  // Regular bulk send
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

      // 2. Check if already contacted
      const { data: existingOutreach } = await svc
        .from('outreach_campaigns')
        .select('id')
        .eq('owner_email', email)
        .in('status', ['sent', 'skipped_active'])
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

      // 4. Send email using template
      const signupLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup?cref=${code}`
      const htmlContent = renderTemplate(templateId, salon_name, owner_name, signupLink, senderName)

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
            to: [email],
            subject: template.subjectFn(salon_name.trim()),
            html: htmlContent,
          })
          emailSent = true
        } else {
          console.log(`[DRY RUN] Outreach email to ${email} for ${salon_name} (template: ${templateId})`)
          emailSent = true
        }
      } catch (emailErr) {
        console.error(`Failed to send outreach email to ${email}:`, emailErr)
      }

      // 5. Record in outreach_campaigns
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
  const skipped = results.filter(r => r.status.startsWith('skipped')).length
  const failed = results.filter(r => r.status === 'failed').length

  return NextResponse.json({ summary: { total: results.length, sent, skipped, failed }, results })
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

  const BATCH_SIZE = 10
  const BATCH_DELAY = 1000

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE)

    for (const campaign of batch) {
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
              ? `${senderName} via GlowUp <onboarding@resend.dev>`
              : 'GlowUp Team <onboarding@resend.dev>',
            to: [campaign.owner_email],
            subject: template.subjectFn(campaign.salon_name),
            html: htmlContent,
          })
          emailSent = true
        } else {
          console.log(`[DRY RUN] Follow-up to ${campaign.owner_email} (template: ${templateId})`)
          emailSent = true
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
