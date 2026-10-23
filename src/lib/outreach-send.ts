// ─── Sending one outreach email (server only) ───
// Shared by the admin outreach route (first sends + follow-ups) and the daily
// queue cron, so the unsubscribe link, headers and suppression check can't
// drift between them.

import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLATFORM_REPLY_TO } from '@/lib/admin'
import { siteBaseUrl } from '@/lib/site-url'
import { OUTREACH_MAILING_ADDRESS, TEMPLATES, normalizeTemplateId, renderTemplate, renderTemplateText, type TemplateId } from '@/lib/outreach-templates'

/** Statuses that mean "don't email this address as a new lead again". */
export const CONTACTED_STATUSES = ['sent', 'queued', 'skipped_active', 'unsubscribed']

export const MISSING_ADDRESS_ERROR =
  'Add GlowUp\'s mailing address (OUTREACH_MAILING_ADDRESS in src/lib/outreach-templates.ts) before sending — the law requires it in every sales email.'

export function outreachReady(): boolean {
  return OUTREACH_MAILING_ADDRESS.trim().length > 0
}

function unsubSig(email: string): string {
  return crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '').update(`outreach-unsub:${email.toLowerCase()}`).digest('hex').slice(0, 24)
}

export function unsubscribeUrl(email: string): string {
  const e = email.trim().toLowerCase()
  return `${siteBaseUrl()}/api/outreach/unsubscribe?e=${encodeURIComponent(e)}&s=${unsubSig(e)}`
}

export function verifyUnsubscribe(email: string, sig: string): boolean {
  const a = Buffer.from(unsubSig(email)), b = Buffer.from(sig || '')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function signupLink(referralCode: string | null | undefined): string {
  return referralCode ? `${siteBaseUrl()}/auth/signup?cref=${referralCode}` : `${siteBaseUrl()}/auth/signup`
}

/** Lower-cased addresses that unsubscribed, out of the given list. */
export async function unsubscribedAmong(svc: SupabaseClient, emails: string[]): Promise<Set<string>> {
  const list = [...new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean))]
  const out = new Set<string>()
  for (let i = 0; i < list.length; i += 500) {
    const { data } = await svc.from('outreach_campaigns').select('owner_email').eq('status', 'unsubscribed').in('owner_email', list.slice(i, i + 500))
    for (const r of data || []) out.add(String(r.owner_email).toLowerCase())
  }
  return out
}

/** Record an unsubscribe and pull the address out of the send queue. */
export async function unsubscribe(svc: SupabaseClient, email: string): Promise<void> {
  const e = email.trim().toLowerCase()
  const { data: existing } = await svc.from('outreach_campaigns').select('id').eq('owner_email', e).eq('status', 'unsubscribed').limit(1)
  if (!existing?.length) {
    await svc.from('outreach_campaigns').insert({ owner_email: e, salon_name: '', owner_name: '', status: 'unsubscribed', sent_at: new Date().toISOString() })
  }
  await svc.from('outreach_campaigns').update({ status: 'unsubscribed' }).eq('owner_email', e).eq('status', 'queued')
}

/** Send one outreach email. Returns null on success, else the reason. */
export async function sendOutreachEmail(opts: {
  to: string
  templateId: TemplateId | string
  salonName: string
  ownerName: string
  referralCode: string | null | undefined
  senderName?: string | null
}): Promise<string | null> {
  if (!outreachReady()) return MISSING_ADDRESS_ERROR
  const to = opts.to.trim().toLowerCase()
  const id = normalizeTemplateId(opts.templateId)
  const link = signupLink(opts.referralCode)
  const unsub = unsubscribeUrl(to)
  const sender = opts.senderName?.trim() || undefined

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DRY RUN] Outreach ${id} to ${to}`)
    return null
  }
  try {
    const { Resend } = await import('resend')
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: sender ? `${sender} via GlowUp <bookings@joinglowup.org>` : 'GlowUp Team <bookings@joinglowup.org>',
      to: [to],
      replyTo: PLATFORM_REPLY_TO,
      subject: TEMPLATES[id].subjectFn(opts.salonName.trim()),
      html: renderTemplate(id, opts.salonName, opts.ownerName, link, sender, unsub),
      text: renderTemplateText(id, opts.salonName, opts.ownerName, link, sender, unsub),
      // One-click unsubscribe (RFC 8058) — Gmail and Yahoo expect it on bulk mail
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    })
    return error ? error.message : null
  } catch (err) {
    return err instanceof Error ? err.message : 'Send failed'
  }
}
