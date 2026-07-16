import { NextRequest, NextResponse } from 'next/server';
import { stripe, PLANS } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { authenticate, isAuthFailure } from '@/lib/api-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Stripe Checkout ───
// Previously unauthenticated, with tenantId/tenantEmail/tenantName all taken
// from the request body. Worse than a read-only IDOR: the branch below writes
// stripe_customer_id back onto the tenant row, so an attacker could point a
// victim salon's billing at a Stripe customer they controlled.
//
// Tenant identity and details now come from the caller's session and their own
// tenant row. Only planKey is still read from the body, and it is validated
// against the PLANS catalogue.
export async function POST(req: NextRequest) {
  try {
    const caller = await authenticate();
    if (isAuthFailure(caller)) return caller.response;

    if (caller.staffRole !== 'owner') {
      return NextResponse.json(
        { error: 'Only the salon owner can manage billing.' },
        { status: 403 }
      );
    }

    const { planKey } = await req.json();
    const tenantId = caller.tenantId;

    const plan = PLANS[planKey];
    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Get or create Stripe customer. Name/email come from the tenant record
    // rather than the body — the caller does not get to describe themselves to
    // Stripe.
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('stripe_customer_id, email, name')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      console.error('[stripe-checkout] tenant lookup failed:', tenantErr);
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }

    const tenantEmail = tenant.email || caller.userEmail;
    const tenantName = tenant.name;

    let customerId = tenant?.stripe_customer_id;

    // Validate existing customer ID still works (could be from a different Stripe account)
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch {
        // Customer doesn't exist on this Stripe account — create a new one
        customerId = null;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: tenantEmail,
        name: tenantName,
        metadata: { tenant_id: tenantId },
      });
      customerId = customer.id;

      // Save customer ID
      const { error: saveErr } = await supabaseAdmin
        .from('tenants')
        .update({ stripe_customer_id: customerId })
        .eq('id', tenantId);

      if (saveErr) {
        // Losing this write silently would strand the Stripe customer: checkout
        // would succeed and the webhook's later lookup by customer id would find
        // no tenant to activate.
        console.error('[stripe-checkout] failed to save stripe_customer_id:', saveErr);
        return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
      }
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 30,
        metadata: { tenant_id: tenantId },
      },
      success_url: `${req.nextUrl.origin}/dashboard/settings?billing=success`,
      cancel_url: `${req.nextUrl.origin}/dashboard/settings?billing=canceled`,
      metadata: { tenant_id: tenantId },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error('Stripe checkout error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to create checkout session: ${message}` },
      { status: 500 }
    );
  }
}
