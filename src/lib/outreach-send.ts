// ─── Sending one outreach email (server only) ───
// Shared by the admin outreach route and the daily queue cron (which sends
// both new-lead and follow-up emails), so the unsubscribe link, headers and
// suppression check can't drift between them.

import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLATFORM_REPLY_TO } from '@/lib/admin'
import { siteBaseUrl } from '@/lib/site-url'
import { FOLLOW_UP_SEQUENCE, OUTREACH_MAILING_ADDRESS, OUTREACH_SENDER_NAME, TEMPLATES, normalizeTemplateId, renderTemplate, renderTemplateText, type TemplateId } from '@/lib/outreach-templates'

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
  const sender = opts.senderName?.trim() || OUTREACH_SENDER_NAME

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DRY RUN] Outreach ${id} to ${to}`)
    return null
  }
  try {
    const { Resend } = await import('resend')
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `${sender} via GlowUp <bookings@joinglowup.org>`,
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

/** Send each campaign its next email in the sequence, stopping at `remaining` sends. */
export async function sendFollowUps(svc: SupabaseClient, campaigns: Campaign[], remaining: number, senderName?: string | null): Promise<FollowUpResult[]> {
  const results: FollowUpResult[] = []
  const BATCH_SIZE = 10
  const BATCH_DELAY = 1000

  for (let i = 0; i < campaigns.length; i += BATCH_SIZE) {
    for (const campaign of campaigns.slice(i, i + BATCH_SIZE)) {
      if (remaining <= 0) {
        results.push({ salon_name: campaign.salon_name, owner_email: campaign.owner_email, status: 'deferred', template: 'tomorrow' })
        continue
      }
      const templateId = FOLLOW_UP_SEQUENCE[campaign.follow_up_count || 0].templateId
      const sendErr = await sendOutreachEmail({
        to: campaign.owner_email, templateId, salonName: campaign.salon_name, ownerName: campaign.owner_name,
        referralCode: campaign.referral_code, senderName,
      })
      if (!sendErr) {
        remaining--
        await svc.from('outreach_campaigns')
          .update({ follow_up_count: (campaign.follow_up_count || 0) + 1, last_follow_up_at: new Date().toISOString(), last_template_id: templateId })
          .eq('id', campaign.id)
      } else {
        console.error(`Follow-up failed for ${campaign.owner_email}:`, sendErr)
      }
      results.push({ salon_name: campaign.salon_name, owner_email: campaign.owner_email, status: sendErr ? 'failed' : 'sent', template: templateId })
    }
    if (i + BATCH_SIZE < campaigns.length) await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
  }
  return results
}
