// ─── Client consent / intake forms (server side) ───
// The paperwork a salon has a client sign before adhesive or chemical
// services (lash extensions, lamination, waxing, tinting): health questions,
// allergies, acknowledged risks, optional photo consent, a signature.
//
// No schema change: the form definition lives in tenants.settings.consent_form
// and a client's signed form in clients.preferences.consent. The signature
// image goes to a PRIVATE storage bucket; only its path is stored, and the
// dashboard asks for a short-lived signed URL to view it.
//
// Types, defaults and the settings reader are in consent-shared.ts so client
// components can use them without pulling in node:crypto.

import crypto from 'node:crypto'
import { readSignedConsent, type ConsentFormConfig, type ConsentState } from './consent-shared'

export * from './consent-shared'

export const SIGNATURE_BUCKET = 'consent-signatures' // private; viewed via signed URLs

/** Changes whenever the questions or terms change, so an old signature can be flagged. */
export function consentFormHash(form: ConsentFormConfig): string {
  return crypto.createHash('sha256').update(JSON.stringify({ q: form.questions, t: form.terms, p: form.photo_consent })).digest('hex').slice(0, 16)
}

/** What the badge should say for this client under this salon's form. */
export function consentState(preferences: unknown, form: ConsentFormConfig, now: Date = new Date()): ConsentState {
  const c = readSignedConsent(preferences)
  if (!c) return { status: 'none' }
  const ageMonths = (now.getTime() - new Date(c.signed_at).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  if (form.resign_months > 0 && ageMonths > form.resign_months) return { status: 'expired', signed_at: c.signed_at, name: c.name }
  if (c.form_hash && c.form_hash !== consentFormHash(form)) return { status: 'outdated', signed_at: c.signed_at, name: c.name }
  return { status: 'valid', signed_at: c.signed_at, name: c.name }
}

// ─── Tokens ───
// Two ways to reach the form: a booking's manage_token (the link on the
// confirmation screen and manage page), or a client token staff hand out
// from the dashboard or the Front Desk tablet. Both are unguessable; the
// client token is an HMAC over (tenant, client) with the service key.

export function clientConsentToken(tenantId: string, clientId: string): string {
  const sig = crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '').update(`consent:${tenantId}:${clientId}`).digest('hex').slice(0, 24)
  return `c.${tenantId}.${clientId}.${sig}`
}

export function parseConsentToken(token: string): { kind: 'manage'; manageToken: string } | { kind: 'client'; tenantId: string; clientId: string } | null {
  if (token.startsWith('c.')) {
    const [, tenantId, clientId, sig] = token.split('.')
    if (!tenantId || !clientId || !sig) return null
    const expected = clientConsentToken(tenantId, clientId).split('.')[3]
    const a = Buffer.from(expected), b = Buffer.from(sig)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    return { kind: 'client', tenantId, clientId }
  }
  if (/^[0-9a-f-]{36}$/i.test(token)) return { kind: 'manage', manageToken: token }
  return null
}
