import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin'

// ─── First-run tenant setup ───
// Called by the signup page immediately after supabase.auth.signUp().
//
// This route previously had NO authentication and took `userId` and `email`
// straight from the request body. `email` drove the ADMIN_EMAILS check, which
// sets plan: 'professional' / subscription_status: 'active' — so anyone who
// knew an admin address could POST themselves a free Professional tenant and
// skip Stripe entirely. `userId` bound the owner staff row to an arbitrary
// account.
//
// Identity now comes from the verified session. Email confirmation is off on
// this project, so signUp() returns a session and the cookie is set by the time
// the signup page calls this — verified, not assumed.
export async function POST(request: Request) {
  const body = await request.json()
  // Presentation-only fields. Anything identity-bearing is taken from the JWT.
  const { businessName, ownerName, referralCode, clientReferralCode } = body

  const authed = await createClient()
  let claims: { sub?: string; email?: string } | null = null
  try {
    const { data } = await authed.auth.getClaims()
    claims = data?.claims ?? null
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable' }, { status: 503 })
  }

  if (!claims?.sub || !claims.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = claims.sub
  const email = claims.email

  // Use service role to bypass RLS
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check if user already has a staff record
  const { data: existingStaff } = await supabase
    .from('staff')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (existingStaff) {
    return NextResponse.json({ success: true, message: 'Already set up' })
  }

  // Create tenant
  const bName = businessName || ownerName || email.split('@')[0] || 'My Salon'
  const slug = bName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') +
    '-' + Math.random().toString(36).slice(2, 6)

  // Check if this user is a platform admin (exempt from subscription).
  // `email` is the JWT's verified claim, not a body field, so this can no
  // longer be spoofed into granting a free Professional plan. Uses the shared
  // lib/admin helper rather than re-deriving the list — the hand-rolled copies
  // drifted (several dropped .filter(Boolean), so a trailing comma in
  // ADMIN_EMAILS made '' an admin email).
  const isAdmin = isAdminEmail(email);

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name: bName,
      slug,
      business_type: 'nail_salon',
      plan: isAdmin ? 'professional' : 'free',
      subscription_status: isAdmin ? 'active' : 'trialing',
      referred_by: referralCode || null,
    })
    .select('id')
    .single()

  if (tenantError) {
    return NextResponse.json({ error: tenantError.message }, { status: 500 })
  }

  // Create staff record (owner)
  const { error: staffError } = await supabase
    .from('staff')
    .insert({
      tenant_id: tenant.id,
      user_id: userId,
      name: ownerName || email.split('@')[0] || 'Owner',
      role: 'owner',
      email,
    })

  if (staffError) {
    return NextResponse.json({ error: staffError.message }, { status: 500 })
  }

  // ── Process referral code ──
  if (referralCode) {
    try {
      // Look up the referral code
      const { data: refCode } = await supabase
        .from('referral_codes')
        .select('id, tenant_id, uses')
        .eq('code', referralCode.trim())
        .single()

      if (refCode) {
        // Log the referral
        await supabase.from('referral_log').insert({
          referrer_tenant_id: refCode.tenant_id,
          referred_tenant_id: tenant.id,
          code: referralCode.trim(),
          reward_applied: true,
        })

        // Increment uses on the referral code
        await supabase
          .from('referral_codes')
          .update({ uses: (refCode.uses || 0) + 1 })
          .eq('id', refCode.id)

        // Extend the referrer's trial by 30 days
        const { data: referrerTenant } = await supabase
          .from('tenants')
          .select('trial_ends_at, current_period_end')
          .eq('id', refCode.tenant_id)
          .single()

        if (referrerTenant) {
          const currentEnd = referrerTenant.current_period_end
            ? new Date(referrerTenant.current_period_end)
            : referrerTenant.trial_ends_at
              ? new Date(referrerTenant.trial_ends_at)
              : new Date()

          // If the date is in the past, start from now
          const baseDate = currentEnd > new Date() ? currentEnd : new Date()
          baseDate.setDate(baseDate.getDate() + 30)

          await supabase
            .from('tenants')
            .update({
              trial_ends_at: baseDate.toISOString(),
            })
            .eq('id', refCode.tenant_id)
        }

        // Also extend the new tenant's trial by 30 days
        const newTrialEnd = new Date()
        newTrialEnd.setDate(newTrialEnd.getDate() + 60) // 30 default + 30 bonus
        await supabase
          .from('tenants')
          .update({ trial_ends_at: newTrialEnd.toISOString() })
          .eq('id', tenant.id)
      }
    } catch (refErr) {
      // Don't fail the signup if referral processing fails
      console.error('Referral processing error:', refErr)
    }
  }

  // ── Process client referral code ──
  if (clientReferralCode) {
    try {
      const { data: crefCode } = await supabase
        .from('client_referral_codes')
        .select('id, code, referrer_name, referrer_email, referred_owner_email, uses')
        .eq('code', clientReferralCode.trim())
        .single()

      if (crefCode) {
        // Get the platform reward amount
        const { data: setting } = await supabase
          .from('platform_settings')
          .select('value')
          .eq('key', 'client_referral_reward')
          .single()

        const rewardAmount = setting ? parseFloat(setting.value) : 25

        // Log the referral as PENDING (gift card issued after first payment)
        await supabase.from('referral_log').insert({
          referred_tenant_id: tenant.id,
          code: clientReferralCode.trim(),
          reward_applied: false,
          client_referrer_name: crefCode.referrer_name,
          client_referrer_email: crefCode.referrer_email,
          client_reward_amount: rewardAmount,
          client_reward_status: 'pending',
        })

        // Increment uses
        await supabase
          .from('client_referral_codes')
          .update({ uses: (crefCode.uses || 0) + 1 })
          .eq('id', crefCode.id)

        // Auto-mark outreach campaign as signed up (close the loop!)
        if (crefCode.referred_owner_email) {
          await supabase
            .from('outreach_campaigns')
            .update({
              signed_up: true,
              signed_up_at: new Date().toISOString(),
              signed_up_tenant_id: tenant.id,
            })
            .eq('referral_code', clientReferralCode.trim())
            .eq('signed_up', false)
        }
      }
    } catch (crefErr) {
      console.error('Client referral processing error:', crefErr)
    }
  }

  return NextResponse.json({ success: true, tenantId: tenant.id })
}
