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
//   2. Create 3 products: Starter ($25/mo), Growth ($75/mo), Professional ($150/mo)
//   3. Copy each Price ID (starts with price_...) and paste below
export const PLANS: Record<string, PlanConfig> = {
  starter: {
    priceId: process.env.STRIPE_PRICE_STARTER || 'price_1TQeAqL9FTcxTGSWITgYCk5u',
    name: 'Starter',
    price: 25,
    staffLimit: 4,
  },
  growth: {
    priceId: process.env.STRIPE_PRICE_GROWTH || 'price_1TQeBFL9FTcxTGSWF79jl49G',
    name: 'Growth',
    price: 75,
    staffLimit: 10,
  },
  professional: {
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL || 'price_1TQeBaL9FTcxTGSWKlpvL8v3',
    name: 'Professional',
    price: 150,
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
