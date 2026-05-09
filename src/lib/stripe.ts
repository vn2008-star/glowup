import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
});

export interface PlanConfig {
  priceId: string;
  name: string;
  price: number;
  staffLimit: number;
}

// ─── Plan Configuration ───
// Create these products/prices in your Stripe Dashboard:
//   1. Go to stripe.com/dashboard → Products → + Add Product
//   2. Create 3 products: Starter ($29/mo), Growth ($79/mo), Professional ($149/mo)
//   3. Copy each Price ID (starts with price_...) and paste below
export const PLANS: Record<string, PlanConfig> = {
  starter: {
    priceId: process.env.STRIPE_PRICE_STARTER || 'price_1TV4PLGb0kiXG0faNTpw97kH',
    name: 'Starter',
    price: 29,
    staffLimit: 4,
  },
  growth: {
    priceId: process.env.STRIPE_PRICE_GROWTH || 'price_1TV4PJGb0kiXG0fa4vwZFlLd',
    name: 'Growth',
    price: 79,
    staffLimit: 10,
  },
  professional: {
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL || 'price_1TV4PIGb0kiXG0faBoIeT9LZ',
    name: 'Professional',
    price: 149,
    staffLimit: 20,
  },
};

export function getPlanByPriceId(priceId: string): PlanConfig | undefined {
  return Object.values(PLANS).find(p => p.priceId === priceId);
}

export function getPlanName(priceId: string | null): string {
  if (!priceId) return 'Free Trial';
  const plan = getPlanByPriceId(priceId);
  return plan ? plan.name : 'Free Trial';
}
