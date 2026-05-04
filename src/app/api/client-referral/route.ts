import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Public endpoint — no auth required
export async function POST(request: Request) {
  const { clientName, clientEmail, salonName, ownerName, ownerEmail } = await request.json()

  if (!clientName || !clientEmail || !salonName || !ownerName || !ownerEmail) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check if this salon owner email is already on GlowUp
  const { data: existingOwner } = await svc
    .from('staff')
    .select('id')
    .eq('role', 'owner')
    .ilike('email', ownerEmail.trim())
    .single()

  if (existingOwner) {
    return NextResponse.json(
      { error: 'This salon owner is already on GlowUp!' },
      { status: 400 }
    )
  }

  // Check if this client already referred this owner email
  const { data: existing } = await svc
    .from('client_referral_codes')
    .select('id, code')
    .eq('referrer_email', clientEmail.trim().toLowerCase())
    .eq('referred_owner_email', ownerEmail.trim().toLowerCase())
    .single()

  if (existing) {
    const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup?cref=${existing.code}`
    return NextResponse.json({
      code: existing.code,
      referralLink: link,
      salonOwnerName: ownerName,
    })
  }

  // Generate a new code: CR-XXXXXX
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const code = 'CR-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  const { error: insertErr } = await svc
    .from('client_referral_codes')
    .insert({
      code,
      referrer_name: clientName.trim(),
      referrer_email: clientEmail.trim().toLowerCase(),
      referred_salon_name: salonName.trim(),
      referred_owner_name: ownerName.trim(),
      referred_owner_email: ownerEmail.trim().toLowerCase(),
    })

  if (insertErr) {
    console.error('Client referral insert error:', insertErr)
    // Retry with different code on unique constraint
    const code2 = 'CR-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const { error: retry } = await svc
      .from('client_referral_codes')
      .insert({
        code: code2,
        referrer_name: clientName.trim(),
        referrer_email: clientEmail.trim().toLowerCase(),
        referred_salon_name: salonName.trim(),
        referred_owner_name: ownerName.trim(),
        referred_owner_email: ownerEmail.trim().toLowerCase(),
      })

    if (retry) {
      return NextResponse.json({ error: 'Failed to generate referral code' }, { status: 500 })
    }

    const link2 = `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup?cref=${code2}`
    return NextResponse.json({
      code: code2,
      referralLink: link2,
      salonOwnerName: ownerName,
    })
  }

  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://glowup-jade.vercel.app'}/auth/signup?cref=${code}`
  return NextResponse.json({
    code,
    referralLink: link,
    salonOwnerName: ownerName,
  })
}
