# Appointment Reminder Setup Guide

## Overview
GlowUp sends automatic appointment reminders 24 hours before each scheduled appointment via **SMS (Twilio)** and **Email (Resend)**.

---

## 1. Run the Database Migration

Go to your **Supabase Dashboard → SQL Editor** and run the contents of:
```
supabase/migrations/006_reminders.sql
```

This creates:
- `appointment_reminders` table for tracking sent reminders
- `sms_opt_out` column on `clients` for STOP handling
- Auto-trigger that generates reminder rows when appointments are booked

---

## 2. Set Up Twilio (SMS)

1. Sign up at [twilio.com](https://twilio.com) (free trial gives ~$15 credit)
2. From the **Console Dashboard**, copy:
   - **Account SID** → `TWILIO_ACCOUNT_SID`
   - **Auth Token** → `TWILIO_AUTH_TOKEN`
3. Go to **Phone Numbers → Buy a Number** → get a US number
   - Copy the number (e.g. `+14155551234`) → `TWILIO_PHONE_NUMBER`
4. Configure the SMS webhook for STOP handling:
   - Go to **Phone Numbers → Active Numbers → your number**
   - Under **Messaging → A message comes in**, set:
     - Webhook URL: `https://glowup-jade.vercel.app/api/twilio-webhook`
     - HTTP Method: `POST`

---

## 3. Set Up Resend (Email)

1. Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month)
2. Go to **API Keys → Create API Key**
3. Copy the key → `RESEND_API_KEY`
4. Emails will send from `onboarding@resend.dev` (Resend's default)
   - To use your own domain later, add it under **Domains** in Resend

---

## 4. Set Environment Variables

### In Vercel Dashboard:
Go to **Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number (e.g. `+14155551234`) |
| `RESEND_API_KEY` | Your Resend API key |
| `CRON_SECRET` | A random secret string (e.g. generate with `openssl rand -hex 32`) |

### In `.env.local` (for local development):
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+14155551234
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CRON_SECRET=your-random-secret-here
```

---

## 5. Deploy

Push to GitHub → Vercel auto-deploys. The `vercel.json` configures the daily cron job automatically.

---

## How It Works

1. **Appointment booked** → Database trigger creates 2 reminder rows: `24h/sms` + `24h/email`
2. **Daily at 8 AM UTC** → Vercel Cron calls `/api/send-reminders`
3. **API route** checks for pending reminders where appointment is 20-28 hours away
4. **Sends SMS** via Twilio (skips opted-out clients)
5. **Sends Email** via Resend
6. **Marks reminders** as `sent`, `skipped`, or `failed`

### Client Opt-Out
- When a client replies **STOP** to an SMS, the `/api/twilio-webhook` marks them as opted out
- They can reply **START** to re-subscribe
- Opted-out clients will have their SMS reminders skipped (email still sends)

### Dry Run Mode
If Twilio/Resend credentials are not set, the system logs messages to the console instead of sending them. This is useful for testing.

---

## Settings UI
Go to **Dashboard → Settings → 🔔 Appointment Reminders** to:
- Enable/disable reminders globally
- Toggle SMS and Email individually
- Customize message templates with merge tags
