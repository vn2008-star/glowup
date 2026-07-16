import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { authenticate, isAuthFailure } from '@/lib/api-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Stripe Billing Portal ───
// Previously took `tenantId` from the request body with no authentication at
// all, so `curl -d '{"tenantId":"<uuid>"}'` returned a live portal URL for any
// salon — their invoices, payment methods and cancel button. Tenant UUIDs are
// recoverable from /api/get-tenant and public booking pages.
//
// The tenant is now derived from the caller's own staff record and the body is
// ignored entirely.
export async function POST(req: NextRequest) {
  try {
    const caller = await authenticate();
    if (isAuthFailure(caller)) return caller.response;

    // Billing is owner territory. A technician has no business opening the
    // portal that can cancel the salon's subscription or change its card.
    if (caller.staffRole !== 'owner') {
      return NextResponse.json(
        { error: 'Only the salon owner can manage billing.' },
        { status: 403 }
      );
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('stripe_customer_id')
      .eq('id', caller.tenantId)
      .single();

    if (error) {
      console.error('[stripe-portal] tenant lookup failed:', error);
      return NextResponse.json({ error: 'Failed to create billing portal session' }, { status: 500 });
    }

    if (!tenant?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${req.nextUrl.origin}/dashboard/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe portal error:', error);
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    );
  }
}
