import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Disable body parsing — Stripe needs the raw body for signature verification
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        if (!tenantId || !session.subscription) break;

        // Fetch subscription details
        const subResponse = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        const sub = 'data' in subResponse ? (subResponse as unknown as { data: Stripe.Subscription }).data : subResponse as unknown as Stripe.Subscription;

        const periodEnd = sub.items.data[0]?.current_period_end;

        await supabaseAdmin.from('tenants').update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: sub.id,
          stripe_price_id: sub.items.data[0]?.price.id,
          subscription_status: sub.status,
          trial_ends_at: sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null,
          current_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
        }).eq('id', tenantId);

        console.log(`✅ Subscription activated for tenant ${tenantId}`);

        // ── Issue client referral rewards ──
        // Find any pending client referral where this tenant was the referred salon
        const { data: pendingReferrals } = await supabaseAdmin
          .from('referral_log')
          .select('id, client_referrer_name, client_referrer_email, client_reward_amount')
          .eq('referred_tenant_id', tenantId)
          .eq('client_reward_status', 'pending')
          .not('client_referrer_email', 'is', null);

        if (pendingReferrals && pendingReferrals.length > 0) {
          for (const ref of pendingReferrals) {
            const amount = ref.client_reward_amount || 25;

            // Create gift card at THIS salon (the one that just paid) for the referring client
            const gcCode = 'GC-' + Array.from({ length: 6 }, () =>
              'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
            ).join('');

            await supabaseAdmin.from('gift_cards').insert({
              tenant_id: tenantId,
              code: gcCode,
              initial_amount: amount,
              balance: amount,
              status: 'active',
              recipient_name: ref.client_referrer_name || 'Referral Reward',
              purchaser_name: 'GlowUp Rewards',
              message: `Thank you for referring this salon to GlowUp! Enjoy your $${amount} reward.`,
            });

            // Mark referral as rewarded
            await supabaseAdmin
              .from('referral_log')
              .update({ reward_applied: true, client_reward_status: 'rewarded' })
              .eq('id', ref.id);

            console.log(`🎁 Client referral reward: $${amount} gift card issued at tenant ${tenantId} for ${ref.client_referrer_email}`);
          }
        }

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenant_id;
        if (!tenantId) break;

        const periodEnd2 = subscription.items.data[0]?.current_period_end;

        await supabaseAdmin.from('tenants').update({
          stripe_price_id: subscription.items.data[0]?.price.id,
          subscription_status: subscription.status,
          trial_ends_at: subscription.trial_end
            ? new Date(subscription.trial_end * 1000).toISOString()
            : null,
          current_period_end: periodEnd2
            ? new Date(periodEnd2 * 1000).toISOString()
            : null,
        }).eq('id', tenantId);

        console.log(`🔄 Subscription updated for tenant ${tenantId}: ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenant_id;
        if (!tenantId) break;

        await supabaseAdmin.from('tenants').update({
          subscription_status: 'canceled',
          stripe_subscription_id: null,
          stripe_price_id: null,
        }).eq('id', tenantId);

        console.log(`❌ Subscription canceled for tenant ${tenantId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find tenant by customer ID
        const { data: tenant } = await supabaseAdmin
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenant) {
          await supabaseAdmin.from('tenants').update({
            subscription_status: 'past_due',
          }).eq('id', tenant.id);

          console.log(`⚠️ Payment failed for tenant ${tenant.id}`);
        }
        break;
      }
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
