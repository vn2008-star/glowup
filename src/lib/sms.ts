// ─── SMS provider router ───
// Three ways to send a text, in priority order:
//   - per-tenant 'android': THIS salon's own cell phone, via the SMS Gateway
//     for Android app (sms-gate.app — free, open source) installed on it.
//     Each salon has its own credentials, so BK Lashes' texts come from BK
//     Lashes' number and Luxe Nails' from theirs. No carrier registration,
//     no shared platform number.
//   - env 'android': a single gateway phone for the whole platform (legacy).
//   - 'twilio': a registered Twilio number (toll-free / 10DLC), used as the
//     fallback for tenants that haven't set up their own phone.
//
// Carrier reality: consumer "unlimited" plans cover person-to-person texting.
// Transactional one-offs (confirmations, reminders, AI replies) look like
// normal texting and are safe; hundreds of near-identical campaign messages
// in minutes look like spam and can get the personal line blocked. So bulk
// sends are gated on canSendBulkSms() — on the Android provider, campaign
// blasts fall back to email-only.

import type { SupabaseClient } from '@supabase/supabase-js'

export type SmsProvider = 'android' | 'twilio'

/**
 * One salon's own gateway phone. Lives in tenants.settings.sms_gateway and is
 * redacted before any tenant row is sent to a browser (see redactTenantSettings
 * in lib/tenant-settings.ts) — it carries a password.
 */
export type TenantSmsConfig = {
  login: string
  password: string
  /** Self-hosted gateway server; defaults to the sms-gate.app cloud. */
  baseUrl?: string
  /** The salon's cell number, for display only. */
  phone?: string
}

/** Shape stored in tenants.settings.sms_gateway. */
export type StoredSmsGateway = {
  enabled?: boolean
  login?: string
  password?: string
  base_url?: string
  phone?: string
  /** Per-tenant secret in the inbound webhook URL. */
  webhook_key?: string
}

const DEFAULT_GATEWAY_URL = 'https://api.sms-gate.app/3rdparty/v1'

/**
 * Read a salon's own gateway credentials. Returns null when the salon hasn't
 * set one up — callers then fall through to the platform provider.
 */
export async function getTenantSmsConfig(
  svc: SupabaseClient,
  tenantId: string | null | undefined
): Promise<TenantSmsConfig | null> {
  if (!tenantId) return null
  const { data } = await svc.from('tenants').select('settings').eq('id', tenantId).single()
  return smsConfigFromSettings(data?.settings)
}

/** Same, when the tenant's settings JSON is already in hand. */
export function smsConfigFromSettings(settings: unknown): TenantSmsConfig | null {
  const s = (settings || {}) as Record<string, unknown>
  const gw = (s.sms_gateway || {}) as StoredSmsGateway
  if (gw.enabled === false) return null
  if (!gw.login || !gw.password) return null
  return {
    login: gw.login,
    password: gw.password,
    baseUrl: gw.base_url || undefined,
    phone: gw.phone || undefined,
  }
}

export function smsProvider(cfg?: TenantSmsConfig | null): SmsProvider | null {
  if (cfg?.login && cfg?.password) return 'android'
  const explicit = (process.env.SMS_PROVIDER || '').toLowerCase()
  if (explicit === 'android' || explicit === 'twilio') return explicit
  if (process.env.SMSGATE_LOGIN && process.env.SMSGATE_PASSWORD) return 'android'
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) return 'twilio'
  return null
}

/** Bulk/campaign SMS is only allowed on a registered business number. */
export function canSendBulkSms(cfg?: TenantSmsConfig | null): boolean {
  return smsProvider(cfg) === 'twilio'
}

async function sendViaTwilio(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) {
    console.log(`[sms] [DRY RUN/twilio] to ${to}: ${body.slice(0, 80)}`)
    return false
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`
  const auth = btoa(`${sid}:${token}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  })
  if (!res.ok) {
    console.error(`[sms] Twilio error (${res.status}): ${(await res.text()).slice(0, 300)}`)
    return false
  }
  const result = await res.json()
  console.log(`[sms] Twilio queued: sid=${result.sid} status=${result.status}`)
  return true
}

async function sendViaAndroidGateway(
  to: string,
  body: string,
  cfg?: TenantSmsConfig | null
): Promise<boolean> {
  const login = cfg?.login || process.env.SMSGATE_LOGIN
  const password = cfg?.password || process.env.SMSGATE_PASSWORD
  if (!login || !password) {
    console.log(`[sms] [DRY RUN/android] to ${to}: ${body.slice(0, 80)}`)
    return false
  }
  const base = (cfg?.baseUrl || process.env.SMSGATE_URL || DEFAULT_GATEWAY_URL).replace(/\/$/, '')
  const auth = btoa(`${login}:${password}`)
  const res = await fetch(`${base}/message`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: body, phoneNumbers: [to] }),
  })
  if (!res.ok) {
    console.error(`[sms] Android gateway error (${res.status}): ${(await res.text()).slice(0, 300)}`)
    return false
  }
  console.log(`[sms] Android gateway queued for ${to}${cfg?.phone ? ` (from ${cfg.phone})` : ''}`)
  return true
}

/**
 * Send one transactional SMS. Pass the salon's own gateway config to send from
 * its phone; omit it to use whatever the platform has configured.
 * Returns false (and logs a DRY RUN) when no provider is set up.
 */
export async function sendSms(
  to: string,
  body: string,
  cfg?: TenantSmsConfig | null
): Promise<boolean> {
  const provider = smsProvider(cfg)
  if (!provider) {
    console.log(`[sms] [DRY RUN] to ${to}: ${body.slice(0, 80)}`)
    return false
  }
  try {
    return provider === 'android'
      ? await sendViaAndroidGateway(to, body, cfg)
      : await sendViaTwilio(to, body)
  } catch (err) {
    console.error(`[sms] ${provider} send failed:`, err)
    return false
  }
}

/**
 * Send a text and report WHY it failed, for the Settings test button. The
 * normal sendSms swallows the reason because callers only branch on success.
 */
export async function sendSmsVerbose(
  to: string,
  body: string,
  cfg: TenantSmsConfig
): Promise<{ ok: boolean; error?: string }> {
  const base = (cfg.baseUrl || DEFAULT_GATEWAY_URL).replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/message`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${cfg.login}:${cfg.password}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: body, phoneNumbers: [to] }),
    })
    if (res.ok) return { ok: true }
    const text = (await res.text()).slice(0, 200)
    if (res.status === 401) return { ok: false, error: 'Wrong username or password for the SMS Gateway app' }
    return { ok: false, error: `Gateway returned ${res.status}: ${text}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach the SMS gateway' }
  }
}
