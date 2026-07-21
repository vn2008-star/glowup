// ─── SMS provider router ───
// Two ways to send a text:
//   - 'android': the owner's own Android phone, via the SMS Gateway for
//     Android app (sms-gate.app — free, open source). Messages go out through
//     the phone's carrier plan from the salon's real cell number.
//   - 'twilio': a registered Twilio number (toll-free / 10DLC).
//
// Carrier reality: consumer "unlimited" plans cover person-to-person texting.
// Transactional one-offs (confirmations, reminders, AI replies) look like
// normal texting and are safe; hundreds of near-identical campaign messages
// in minutes look like spam and can get the personal line blocked. So bulk
// sends are gated on canSendBulkSms() — on the Android provider, campaign
// blasts fall back to email-only.

export type SmsProvider = 'android' | 'twilio'

export function smsProvider(): SmsProvider | null {
  const explicit = (process.env.SMS_PROVIDER || '').toLowerCase()
  if (explicit === 'android' || explicit === 'twilio') return explicit
  if (process.env.SMSGATE_LOGIN && process.env.SMSGATE_PASSWORD) return 'android'
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) return 'twilio'
  return null
}

/** Bulk/campaign SMS is only allowed on a registered business number. */
export function canSendBulkSms(): boolean {
  return smsProvider() === 'twilio'
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

async function sendViaAndroidGateway(to: string, body: string): Promise<boolean> {
  const login = process.env.SMSGATE_LOGIN
  const password = process.env.SMSGATE_PASSWORD
  if (!login || !password) {
    console.log(`[sms] [DRY RUN/android] to ${to}: ${body.slice(0, 80)}`)
    return false
  }
  const base = (process.env.SMSGATE_URL || 'https://api.sms-gate.app/3rdparty/v1').replace(/\/$/, '')
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
  console.log(`[sms] Android gateway queued for ${to}`)
  return true
}

/**
 * Send one transactional SMS via whichever provider is configured.
 * Returns false (and logs a DRY RUN) when no provider is set up.
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const provider = smsProvider()
  if (!provider) {
    console.log(`[sms] [DRY RUN] to ${to}: ${body.slice(0, 80)}`)
    return false
  }
  try {
    return provider === 'android' ? await sendViaAndroidGateway(to, body) : await sendViaTwilio(to, body)
  } catch (err) {
    console.error(`[sms] ${provider} send failed:`, err)
    return false
  }
}
