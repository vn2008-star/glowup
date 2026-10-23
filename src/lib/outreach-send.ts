// ─── Sending one outreach email (server only) ───
// Shared by the admin outreach route and the daily queue cron (which sends
// both new-lead and follow-up emails), so the unsubscribe link, headers and
// suppression check can't drift between them.

import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLATFORM_REPLY_TO } from '@/lib/admin'
import { FOLLOW_UP_SEQUENCE, OUTREACH_MAILING_ADDRESS, OUTREACH_SENDER_NAME, TEMPLATES, normalizeTemplateId, renderTemplate, renderTemplateText, type TemplateId } from '@/lib/outreach-templates'

/** Statuses that mean "don't email this address as a new lead again". */
export const CONTACTED_STATUSES = ['sent', 'queued', 'skipped_active', 'unsubscribed', 'undeliverable']

export const MISSING_ADDRESS_ERROR =
  'Add GlowUp\'s mailing address (OUTREACH_MAILING_ADDRESS in src/lib/outreach-templates.ts) before sending — the law requires it in every sales email.'

export function outreachReady(): boolean {
  return OUTREACH_MAILING_ADDRESS.trim().length > 0
}

function unsubSig(email: string): string {
  return crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '').update(`outreach-unsub:${email.toLowerCase()}`).digest('hex').slice(0, 24)
}

/**
 * Links in sales emails always use the GlowUp brand domain, not whatever the
 * deployment's site URL resolves to (which can be the vercel.app address).
 */
const OUTREACH_SITE_URL = 'https://www.joinglowup.org'

export function unsubscribeUrl(email: string): string {
  const e = email.trim().toLowerCase()
  return `${OUTREACH_SITE_URL}/api/outreach/unsubscribe?e=${encodeURIComponent(e)}&s=${unsubSig(e)}`
}

export function verifyUnsubscribe(email: string, sig: string): boolean {
  const a = Buffer.from(unsubSig(email)), b = Buffer.from(sig || '')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function signupLink(referralCode: string | null | undefined): string {
  return referralCode ? `${OUTREACH_SITE_URL}/auth/signup?cref=${referralCode}` : `${OUTREACH_SITE_URL}/auth/signup`
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

export type OutreachEmail = {
  to: string
  templateId: TemplateId | string
  salonName: string
  ownerName: string
  referralCode: string | null | undefined
  senderName?: string | null
}

function buildEmail(opts: OutreachEmail) {
  const to = opts.to.trim().toLowerCase()
  const id = normalizeTemplateId(opts.templateId)
  const link = signupLink(opts.referralCode)
  const unsub = unsubscribeUrl(to)
  const sender = opts.senderName?.trim() || OUTREACH_SENDER_NAME
  return {
    from: `${sender} via GlowUp <bookings@joinglowup.org>`,
    to: [to],
    replyTo: PLATFORM_REPLY_TO,
    subject: TEMPLATES[id].subjectFn(opts.salonName.trim()),
    html: renderTemplate(id, opts.salonName, opts.ownerName, link, sender, unsub),
    text: renderTemplateText(id, opts.salonName, opts.ownerName, link, sender, unsub),
    // One-click unsubscribe (RFC 8058) — Gmail and Yahoo expect it on bulk mail
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }
}

/**
 * Send up to 100 outreach emails in ONE Resend request. One request per email
 * ran into Resend's requests-per-second limit and the 60-second function
 * limit at 95 emails a day.
 *
 * Returns { error } when nothing was sent (callers leave those rows as they
 * were, so they go out on the next run), else the indexes that Resend
 * rejected individually.
 */
export async function sendOutreachBatch(emails: OutreachEmail[]): Promise<{ error: string } | { failed: Map<number, string> }> {
  if (!outreachReady()) return { error: MISSING_ADDRESS_ERROR }
  if (!emails.length) return { failed: new Map() }
  if (emails.length > 100) return { error: 'Resend sends at most 100 emails per batch' }

  if (!process.env.RESEND_API_KEY) {
    for (const e of emails) console.log(`[DRY RUN] Outreach ${normalizeTemplateId(e.templateId)} to ${e.to}`)
    return { failed: new Map() }
  }
  try {
    const { Resend } = await import('resend')
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).batch.send(emails.map(buildEmail), { batchValidation: 'permissive' })
    if (error) return { error: error.message }
    return { failed: new Map((data?.errors || []).map(e => [e.index, e.message])) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Send failed' }
  }
}

// ─── Junk addresses ───
// Scraped lead lists pick up addresses from website templates and footers:
// the site builder's placeholder, the font foundry, the domain seller, the web
// designer. Emailing those gets bounces and spam reports that hurt
// bookings@joinglowup.org, which salons' booking emails also come from.

const PLACEHOLDER_DOMAIN = /(^|\.)(example|sample|xyz|mysite|mystore|yoursite|yourdomain|yourcompany|domain|address|newsletter|domainmarket|domainregistryinc|godaddy|wix|wixpress|sentry|squarespace|latofonts|indiantypefoundry)\.[a-z.]+$/
const PLACEHOLDER_LOCAL = /^(example|filler|yourname|youremail|yourdomain|your\.?email|name|email|test|user|noreply|no-reply|domainbroker)$/
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg)$/

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Whether the address's domain looks like one of these salon names (info@happinessnailsspa.com). */
function domainMatchesSalon(domain: string, salons: Set<string>): boolean {
  const label = alnum(domain.split('.').slice(-2, -1)[0] || '')
  return label.length >= 4 && [...salons].some(n => n.includes(label) || (n.length >= 4 && label.includes(n)))
}

/**
 * Addresses that aren't a salon's own, with the reason. An address on 2+
 * differently named businesses is a vendor's (booking software, website
 * builder, font foundry) unless its domain matches one of their names: a
 * chain's info@ on every location is real.
 */
export function junkEmails(leads: { salon_name?: string | null; owner_email?: string | null }[]): Map<string, string> {
  const names = new Map<string, Set<string>>()
  for (const l of leads) {
    const e = String(l.owner_email || '').trim().toLowerCase()
    if (!e) continue
    if (!names.has(e)) names.set(e, new Set())
    names.get(e)!.add(alnum(l.salon_name || ''))
  }
  const junk = new Map<string, string>()
  for (const [email, salons] of names) {
    const [local, domain = ''] = email.split('@')
    const own = domainMatchesSalon(domain, salons)
    if (!domain || !domain.includes('.') || IMAGE_FILE.test(email)) junk.set(email, 'not an email address')
    else if (PLACEHOLDER_DOMAIN.test(domain) || (PLACEHOLDER_LOCAL.test(local) && !own)) junk.set(email, 'website placeholder')
    else if (salons.size >= 2 && !own) junk.set(email, `shared by ${salons.size} businesses`)
  }
  return junk
}

/**
 * Domains that can't receive email (typos like gmai.com, dead domains), from
 * a DNS mail-server lookup. A lookup that times out or errors otherwise
 * counts as fine: only a definite "no such domain / no mail server" drops it.
 */
export async function undeliverableDomains(emails: string[]): Promise<Set<string>> {
  const { promises: dns } = await import('node:dns')
  const domains = [...new Set(emails.map(e => e.trim().toLowerCase().split('@')[1]).filter(Boolean))]
  const bad = new Set<string>()
  const check = async (d: string) => {
    try {
      const mx = await Promise.race([dns.resolveMx(d), new Promise<null>(r => setTimeout(() => r(null), 3000))])
      if (mx && mx.length === 0) bad.add(d)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'ENOTFOUND' || code === 'ENODATA') {
        // No MX record: mail falls back to the domain's own address, if it has one
        try { await dns.resolve(d) } catch { bad.add(d) }
      }
    }
  }
  for (let i = 0; i < domains.length; i += 50) await Promise.all(domains.slice(i, i + 50).map(check))
  return bad
}

/** Most outreach emails per day: Resend's free tier is 100/day, 5 left as a buffer. */
export const DAILY_LIMIT = 95

/** Outreach emails sent since midnight (server time): first emails plus follow-ups. */
export async function sentTodayCount(svc: SupabaseClient): Promise<number> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const [{ count: firsts }, { count: followUps }] = await Promise.all([
    svc.from('outreach_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', todayStart.toISOString()),
    svc.from('outreach_campaigns').select('*', { count: 'exact', head: true }).gte('last_follow_up_at', todayStart.toISOString()),
  ])
  return (firsts || 0) + (followUps || 0)
}

export type Campaign = {
  id: string; salon_name: string; owner_name: string; owner_email: string; referral_code: string | null
  sent_at: string | null; last_follow_up_at: string | null; follow_up_count: number | null; signed_up: boolean
}

/**
 * Sent campaigns whose next follow-up is due: no signup, not unsubscribed,
 * fewer than 3 follow-ups, and enough days since the last email.
 *
 * Signups are only tracked through the referral link, so a salon that joined
 * on its own (or through the "send us your website" import) would keep
 * getting sales emails. Any address that now owns a salon is marked signed
 * up here instead and dropped.
 */
export async function dueFollowUps(svc: SupabaseClient, limit: number, ids?: string[]): Promise<Campaign[]> {
  let q = svc.from('outreach_campaigns').select('*')
    .eq('status', 'sent')
    .eq('signed_up', false)
    .lt('follow_up_count', FOLLOW_UP_SEQUENCE.length)
    .order('sent_at', { ascending: true })
    .limit(1000)
  if (ids?.length) q = q.in('id', ids)
  const { data } = await q
  const now = Date.now()
  const due = ((data || []) as Campaign[]).filter(c => {
    const step = FOLLOW_UP_SEQUENCE[c.follow_up_count || 0]
    const last = c.last_follow_up_at || c.sent_at
    return step && last && now - new Date(last).getTime() >= step.daysAfterPrevious * 86400000
  })
  if (!due.length) return []

  const emails = [...new Set(due.map(c => c.owner_email.toLowerCase()))]
  const unsubscribed = await unsubscribedAmong(svc, emails)
  const ownerTenant = new Map<string, string>()
  for (let i = 0; i < emails.length; i += 300) {
    const { data: owners } = await svc.from('staff').select('email, tenant_id').eq('role', 'owner').in('email', emails.slice(i, i + 300))
    for (const o of owners || []) ownerTenant.set(String(o.email).toLowerCase(), o.tenant_id)
  }

  const joined = due.filter(c => ownerTenant.has(c.owner_email.toLowerCase()))
  for (const c of joined) {
    await svc.from('outreach_campaigns')
      .update({ signed_up: true, signed_up_at: new Date().toISOString(), signed_up_tenant_id: ownerTenant.get(c.owner_email.toLowerCase()) })
      .eq('id', c.id)
  }

  return due
    .filter(c => !unsubscribed.has(c.owner_email.toLowerCase()) && !ownerTenant.has(c.owner_email.toLowerCase()))
    .slice(0, limit)
}

export type FollowUpResult = { salon_name: string; owner_email: string; status: 'sent' | 'failed' | 'deferred'; template: string }

/** The next email in the sequence for a campaign that's due one. */
export function followUpEmail(c: Campaign, senderName?: string | null): OutreachEmail {
  return {
    to: c.owner_email, templateId: FOLLOW_UP_SEQUENCE[c.follow_up_count || 0].templateId,
    salonName: c.salon_name, ownerName: c.owner_name, referralCode: c.referral_code, senderName,
  }
}

/** Record follow-ups that went out: bump each campaign's step. */
export async function markFollowUpsSent(svc: SupabaseClient, campaigns: Campaign[]): Promise<void> {
  const now = new Date().toISOString()
  // One update per step rather than per campaign
  const byStep = new Map<number, string[]>()
  for (const c of campaigns) byStep.set(c.follow_up_count || 0, [...(byStep.get(c.follow_up_count || 0) || []), c.id])
  for (const [step, ids] of byStep) {
    await svc.from('outreach_campaigns')
      .update({ follow_up_count: step + 1, last_follow_up_at: now, last_template_id: FOLLOW_UP_SEQUENCE[step].templateId })
      .in('id', ids)
  }
}

/** Send each campaign its next email in the sequence, up to `remaining` sends; the rest wait. */
export async function sendFollowUps(svc: SupabaseClient, campaigns: Campaign[], remaining: number, senderName?: string | null): Promise<FollowUpResult[]> {
  const now = campaigns.slice(0, Math.max(0, Math.min(remaining, 100)))
  const later = campaigns.slice(now.length)
  const template = (c: Campaign) => FOLLOW_UP_SEQUENCE[c.follow_up_count || 0].templateId
  const result = await sendOutreachBatch(now.map(c => followUpEmail(c, senderName)))
  if ('error' in result) console.error('Follow-up batch failed:', result.error)
  const failed = 'error' in result ? null : result.failed
  await markFollowUpsSent(svc, now.filter((_, i) => failed && !failed.has(i)))
  return [
    ...now.map((c, i) => ({ salon_name: c.salon_name, owner_email: c.owner_email, status: (failed && !failed.has(i) ? 'sent' : 'failed') as FollowUpResult['status'], template: template(c) })),
    ...later.map(c => ({ salon_name: c.salon_name, owner_email: c.owner_email, status: 'deferred' as const, template: 'tomorrow' })),
  ]
}
