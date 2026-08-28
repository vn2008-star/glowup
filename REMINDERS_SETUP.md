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

Push to GitHub → Vercel auto-deploys. The `vercel.json` configures the cron job automatically.

Reminder types and channels are guarded by CHECK constraints, so run
`supabase/migrations/20260828_reminders_30m_owner.sql` before deploying the
30-minute / owner reminders — without it those rows are rejected (the app keeps
the 24h/2h/1h ones by inserting them in a separate batch, and logs the reason).

---

## How It Works

1. **Appointment booked** → the app creates a pending row for every lead time
   (`24h`, `2h`, `1h`, `30m`) on every channel: `sms`/`email` for the client,
   `owner_sms`/`owner_email` for the salon's own copy
2. **Every 10 minutes** → Vercel Cron calls `/api/send-reminders`
3. **API route** finds pending rows whose appointment is inside that lead time's
   window, and drops the ones the salon has switched off in Settings
4. **Sends SMS** via Twilio (skips opted-out clients)
5. **Sends Email** via Resend
6. **Marks reminders** as `sent`, `skipped`, or `failed`

Rows are created for every timing whether or not it's enabled, so turning a
timing on applies to bookings that are already in the diary.

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
