import { NextRequest, NextResponse } from 'next/server';
import { stripe, PLANS } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { planKey, tenantId, tenantEmail, tenantName } = await req.json();

    const plan = PLANS[planKey];
    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Get or create Stripe customer
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('stripe_customer_id')
      .eq('id', tenantId)
      .single();

    let customerId = tenant?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: tenantEmail,
        name: tenantName,
        metadata: { tenant_id: tenantId },
      });
      customerId = customer.id;

      // Save customer ID
      await supabaseAdmin
        .from('tenants')
        .update({ stripe_customer_id: customerId })
        .eq('id', tenantId);
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
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
