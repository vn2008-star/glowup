// ─── Twilio webhook signature verification ───
//
// The webhook had none. Twilio's endpoint is public by necessity, and the
// handler acts on whatever `From` it is given: POST `From=<victim's number>&
// Body=STOP` and that person stops receiving reminders; `Body=X` cancels their
// next appointment. Nobody needs an account, a token, or anything but the
// number — and phone numbers are not secret.
//
// Twilio signs every request. The algorithm (per Twilio's security docs):
//   1. Take the full URL Twilio requested, including any query string.
//   2. Append each POST parameter, sorted by key, as key + value with no
//      separators.
//   3. HMAC-SHA1 that string with the account's auth token.
//   4. Base64. That is the X-Twilio-Signature header.
//
// Implemented here rather than via the twilio SDK: it is ~15 lines, the SDK is
// otherwise unused at runtime (the send path posts to the REST API with fetch),
// and pulling a large dependency into a serverless function costs cold-start
// time on a route that must answer fast.

import crypto from 'crypto'

/**
 * Rebuild the URL Twilio actually requested.
 *
 * request.url is the internal URL behind Vercel's proxy, which will not match
 * what Twilio signed. The signature is over the public URL configured in the
 * Twilio console, so trust the forwarded headers to reconstruct it.
 */
export function publicUrlFor(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
  const host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    url.host
  return `${proto}://${host}${url.pathname}${url.search}`
}

/**
 * True when `signature` is a valid Twilio signature for this url + params.
 *
 * Comparison is constant-time: a fast `===` leaks, byte by byte, how much of a
 * guess was right, which is enough to forge a signature given enough attempts.
 */
export function isValidTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string
): boolean {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(payload, 'utf-8'))
    .digest('base64')

  const given = Buffer.from(signature)
  const want = Buffer.from(expected)
  if (given.length !== want.length) return false
  return crypto.timingSafeEqual(given, want)
}

/**
 * Verify an incoming Twilio webhook. Returns null when the request is genuine,
 * or a Response to return immediately when it is not.
 *
 * Fails closed when TWILIO_AUTH_TOKEN is unset — the same lesson as the cron
 * guards, which skipped their check entirely whenever their secret was missing
 * and were wide open in production because of it.
 */
export function verifyTwilioRequest(
  request: Request,
  params: Record<string, string>
): Response | null {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('[twilio-webhook] TWILIO_AUTH_TOKEN is not set — refusing the request.')
    return new Response('Forbidden', { status: 403 })
  }

  const signature = request.headers.get('x-twilio-signature')
  if (!signature) {
    console.warn('[twilio-webhook] request with no X-Twilio-Signature header — refused.')
    return new Response('Forbidden', { status: 403 })
  }

  const url = publicUrlFor(request)
  if (!isValidTwilioSignature(url, params, signature, authToken)) {
    console.warn(`[twilio-webhook] invalid signature for ${url} — refused.`)
    return new Response('Forbidden', { status: 403 })
  }

  return null
}
