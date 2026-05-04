import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Verify the current user is a platform admin
async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
  if (!adminEmails.includes(user.email?.toLowerCase() || '')) return null

  return user
}

// GET — list past outreach campaigns
export async function GET() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized', your_email: '' }, { status: 403 })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await svc
    .from('outreach_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ campaigns: data || [] })
}

// POST — send bulk outreach emails
export async function POST(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { leads, senderName, senderEmail } = await request.json()

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: 'No leads provided' }, { status: 400 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const genCode = () => 'CR-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  const results: Array<{
    salon_name: string
    owner_name: string
    owner_email: string
    status: string
    code?: string
    error?: string
  }> = []

  // Rate-limit: process in batches of 10 with 1s delay
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
        // Record as skipped
        await svc.from('outreach_campaigns').insert({
          salon_name: salon_name.trim(),
          owner_name: owner_name.trim(),
          owner_email: email,
          phone: phone?.trim() || null,
          city: city?.trim() || null,
          state: state?.trim() || null,
          status: 'skipped_active',
          referral_code: null,
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

      // Insert into client_referral_codes (reusing existing table for signup tracking)
      await svc.from('client_referral_codes').insert({
        code,
        referrer_name: senderName || 'GlowUp Team',
        referrer_email: senderEmail || 'outreach@glowup.com',
        referred_salon_name: salon_name.trim(),
        referred_owner_name: owner_name.trim(),
        referred_owner_email: email,
      })

      // 4. Send email
      const signupLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup?cref=${code}`

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
            subject: `✨ ${salon_name} — free salon management that pays for itself`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #1a1a2e; color: #e0e0e0; border-radius: 16px;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h1 style="font-size: 28px; margin: 0; background: linear-gradient(135deg, #e8a87c, #d4a0e8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">✨ GlowUp</h1>
                </div>

                <div style="margin-bottom: 24px;">
                  <p style="font-size: 16px; line-height: 1.6; color: #ffffff; margin: 0 0 16px;">
                    Hi ${owner_name.trim()},
                  </p>
                  <p style="font-size: 14px; line-height: 1.7; color: #c0c0c0; margin: 0 0 16px;">
                    I wanted to reach out because I think <strong style="color: #ffffff;">${salon_name.trim()}</strong> would be a great fit for GlowUp — the all-in-one platform that helps beauty businesses grow on autopilot.
                  </p>
                  <p style="font-size: 14px; line-height: 1.7; color: #c0c0c0; margin: 0 0 16px;">
                    Salons using GlowUp see on average:
                  </p>
                </div>

                <div style="display: flex; gap: 12px; margin-bottom: 24px;">
                  <div style="flex: 1; background: #2a2a3e; border-radius: 12px; padding: 16px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 800; color: #e8a87c;">60%</div>
                    <div style="font-size: 11px; color: #999; margin-top: 4px;">Less no-shows</div>
                  </div>
                  <div style="flex: 1; background: #2a2a3e; border-radius: 12px; padding: 16px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 800; color: #d4a0e8;">3.2×</div>
                    <div style="font-size: 11px; color: #999; margin-top: 4px;">More repeat visits</div>
                  </div>
                  <div style="flex: 1; background: #2a2a3e; border-radius: 12px; padding: 16px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 800; color: #22c55e;">45%</div>
                    <div style="font-size: 11px; color: #999; margin-top: 4px;">Revenue increase</div>
                  </div>
                </div>

                <div style="background: #2a2a3e; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                  <p style="font-size: 13px; color: #b0b0b0; margin: 0 0 8px;"><strong style="color: #d4a0e8;">What you get:</strong></p>
                  <ul style="font-size: 13px; color: #c0c0c0; line-height: 1.8; margin: 0; padding-left: 18px;">
                    <li>Smart booking with photo-based CRM</li>
                    <li>Automated reminders that cut no-shows</li>
                    <li>"Fill My Openings" — blast last-minute availability</li>
                    <li>Client loyalty & retention automation</li>
                    <li>Staff performance reports</li>
                  </ul>
                </div>

                <div style="text-align: center; margin-bottom: 24px;">
                  <a href="${signupLink}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #c37eda, #e8a87c); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px;">
                    Start Your Free Trial →
                  </a>
                  <p style="font-size: 12px; color: #888; margin: 12px 0 0;">No credit card required. Setup takes 2 minutes.</p>
                </div>

                <div style="text-align: center; border-top: 1px solid #333; padding-top: 16px;">
                  <p style="color: #666; font-size: 11px; margin: 0;">
                    ${senderName ? `— ${senderName}, GlowUp Team` : '— The GlowUp Team'}
                  </p>
                  <p style="color: #555; font-size: 10px; margin: 8px 0 0;">
                    Reply to this email if you have any questions. We'd love to help ${salon_name.trim()} grow!
                  </p>
                </div>
              </div>
            `,
          })
          emailSent = true
        } else {
          console.log(`[DRY RUN] Outreach email to ${email} for ${salon_name}`)
          emailSent = true // Count as sent in dry run
        }
      } catch (emailErr) {
        console.error(`Failed to send outreach email to ${email}:`, emailErr)
      }

      // 5. Record in outreach_campaigns
      await svc.from('outreach_campaigns').insert({
        salon_name: salon_name.trim(),
        owner_name: owner_name.trim(),
        owner_email: email,
        phone: phone?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        referral_code: code,
        status: emailSent ? 'sent' : 'failed',
        sent_at: emailSent ? new Date().toISOString() : null,
      })

      results.push({
        salon_name,
        owner_name,
        owner_email: email,
        status: emailSent ? 'sent' : 'failed',
        code,
      })
    }

    // Batch delay for rate limiting
    if (i + BATCH_SIZE < leads.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
    }
  }

  const sent = results.filter(r => r.status === 'sent').length
  const skipped = results.filter(r => r.status.startsWith('skipped')).length
  const failed = results.filter(r => r.status === 'failed').length

  return NextResponse.json({
    summary: { total: results.length, sent, skipped, failed },
    results,
  })
}
