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
          // Get salon name for the email
          const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('name')
            .eq('id', tenantId)
            .single();
          const salonName = tenant?.name || 'the salon';

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
              message: `Thank you for referring ${salonName} to GlowUp! Enjoy your $${amount} reward.`,
            });

            // Mark referral as rewarded
            await supabaseAdmin
              .from('referral_log')
              .update({ reward_applied: true, client_reward_status: 'rewarded' })
              .eq('id', ref.id);

            // ── Email the client about their reward ──
            if (ref.client_referrer_email) {
              try {
                if (process.env.RESEND_API_KEY) {
                  const { Resend } = await import('resend');
                  const resend = new Resend(process.env.RESEND_API_KEY);
                  await resend.emails.send({
                    from: 'GlowUp <onboarding@resend.dev>',
                    to: [ref.client_referrer_email],
                    subject: `🎁 You earned a $${amount} gift card at ${salonName}!`,
                    html: `
                      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #1a1a2e; color: #e0e0e0; border-radius: 16px;">
                        <div style="text-align: center; margin-bottom: 24px;">
                          <h1 style="font-size: 28px; margin: 0; background: linear-gradient(135deg, #e8a87c, #d4a0e8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">✨ GlowUp</h1>
                        </div>
                        <div style="text-align: center; margin-bottom: 24px;">
                          <div style="font-size: 48px; margin-bottom: 8px;">🎁</div>
                          <h2 style="font-size: 22px; color: #ffffff; margin: 0 0 8px;">Congrats, ${ref.client_referrer_name || 'there'}!</h2>
                          <p style="color: #b0b0b0; font-size: 15px; margin: 0;">Your referral paid off — literally!</p>
                        </div>
                        <div style="background: #2a2a3e; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                          <p style="color: #b0b0b0; font-size: 13px; margin: 0 0 8px;">Your gift card code</p>
                          <div style="font-size: 28px; font-weight: 800; letter-spacing: 0.1em; color: #e8a87c; font-family: monospace;">${gcCode}</div>
                          <p style="color: #b0b0b0; font-size: 14px; margin: 12px 0 0;">
                            Worth <strong style="color: #22c55e; font-size: 20px;">$${amount}</strong> at <strong style="color: #ffffff;">${salonName}</strong>
                          </p>
                        </div>
                        <div style="background: #2a2a3e; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                          <p style="color: #b0b0b0; font-size: 13px; margin: 0;">
                            <strong style="color: #d4a0e8;">How to use:</strong> Simply mention this code at checkout when you visit <strong>${salonName}</strong>. The staff will apply your gift card balance to your service.
                          </p>
                        </div>
                        <div style="text-align: center; border-top: 1px solid #333; padding-top: 16px;">
                          <p style="color: #666; font-size: 11px; margin: 0;">Thank you for helping ${salonName} discover GlowUp!</p>
                        </div>
                      </div>
                    `,
                  });
                  console.log(`📧 Reward email sent to ${ref.client_referrer_email} for gift card ${gcCode}`);
                } else {
                  console.log(`[DRY RUN] Reward email to ${ref.client_referrer_email}: $${amount} gift card ${gcCode} at ${salonName}`);
                }
              } catch (emailErr) {
                console.error(`Failed to send reward email to ${ref.client_referrer_email}:`, emailErr);
                // Don't fail the whole webhook if email fails
              }
            }

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
