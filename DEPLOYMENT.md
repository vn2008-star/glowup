# GlowUp Deployment Guide

## 🌐 Production URLs
- **App**: https://glowup-jade.vercel.app
- **Booking Page**: https://glowup-jade.vercel.app/book/nails-by-jamie-peev
- **GitHub Repo**: https://github.com/vn2008-star/glowup

---

## 🚀 Deploy / Redeploy (After Making Changes)

### Step 1: Build Locally (Optional — Catches Errors Early)
```bash
npm run build
```
If you see errors, fix them before pushing.

### Step 2: Commit Your Changes
```bash
git add -A
git commit -m "Describe what you changed"
```

### Step 3: Push to GitHub
```bash
git push origin main
```

**That's it!** Vercel auto-deploys when you push to `main`. 
Check deployment status at: https://vercel.com/vn2008-stars-projects/glowup/deployments

---

## ⚙️ Environment Variables (Vercel Dashboard)

If you need to add/update env vars:
1. Go to https://vercel.com/vn2008-stars-projects/glowup/settings/environment-variables
2. Add or edit the variable
3. **Redeploy** for changes to take effect (Deployments → ⋮ → Redeploy)

### Current Environment Variables:
```
NEXT_PUBLIC_SUPABASE_URL = https://fscmlqbjoweaqkzduqrj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = (your anon key)
SUPABASE_SERVICE_ROLE_KEY = (your service role key)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_51TQd8FL9FTcxTGSW...
STRIPE_SECRET_KEY = (needs valid sk_live_ or sk_test_ key)
STRIPE_WEBHOOK_SECRET = whsec_NS7Z7o6510fTfaTikQOU1aFhiGrfxADU
STRIPE_PRICE_STARTER = price_1TQeAqL9FTcxTGSWITgYCk5u
STRIPE_PRICE_GROWTH = price_1TQeBFL9FTcxTGSWF79jl49G
STRIPE_PRICE_PROFESSIONAL = price_1TQeBaL9FTcxTGSWKlpvL8v3
```

---

## 🔐 Supabase Auth (Redirect URLs)

If you change your domain, update these:
1. Go to https://supabase.com/dashboard/project/fscmlqbjoweaqkzduqrj/auth/url-configuration
2. **Site URL**: `https://glowup-jade.vercel.app`
3. **Redirect URLs**:
   - `https://glowup-jade.vercel.app/**`
   - `http://localhost:3000/**`

---

## 🔄 Force Redeploy (If Auto-Deploy Didn't Trigger)

### Option A: From Vercel Dashboard
1. Go to Deployments → click ⋮ on latest → **Redeploy**

### Option B: From Terminal
```bash
git commit --allow-empty -m "Trigger redeploy"
git push origin main
```

---

## 🛠 Troubleshooting

### Build Fails on Vercel
1. Run `npm run build` locally to see the error
2. Fix the TypeScript/code error
3. Commit and push again

### Login Not Working on Production
- Check Supabase **URL Configuration** — make sure your Vercel domain is in the redirect URLs

### Stripe Checkout Not Working
- Verify `STRIPE_SECRET_KEY` starts with `sk_live_` or `sk_test_` (not `mk_`)
- Verify all 3 `STRIPE_PRICE_*` vars are set in Vercel env vars
- Redeploy after changing env vars

### Booking Page Shows No Services
- Add services in **Dashboard → Services** first
- Services must be marked as "Active"

---

## 📁 Key Files
| File | Purpose |
|------|---------|
| `.env.local` | Local environment variables |
| `src/lib/stripe.ts` | Stripe plan config & price mapping |
| `src/app/api/stripe/checkout/route.ts` | Stripe checkout session creation |
| `src/app/api/stripe/webhook/route.ts` | Stripe webhook handler |
| `src/app/api/public-booking/route.ts` | Public booking API (no auth) |
| `src/app/book/[slug]/BookingClient.tsx` | Client-facing booking page |
| `src/lib/types.ts` | TypeScript type definitions |
