// ─── GlowUp Outreach Templates ───
// A 4-email sequence for salons that haven't heard of GlowUp, plus 4 texts
// for people who replied or asked to be texted.
//
// Rules this copy keeps (rewritten 2026-10-22 after review):
// - Only claim what the app does today. No invented stats, testimonials,
//   "free forever", or fake scarcity — the trial is 30 days, plans $29/79/149.
// - CAN-SPAM: every email carries the mailing address and an unsubscribe link.
//   Sending is refused while OUTREACH_MAILING_ADDRESS is empty.
// - Plain, light layout. The old dark cards used data-URI logos, flex/grid and
//   gradient text, which Gmail and Outlook strip or render invisible — and
//   plain mail lands in the inbox more often than designed mail.
//
// Imported by the client-side preview page too, so nothing server-only here
// (unsubscribe tokens live in lib/outreach-send).

/**
 * Printed in every outreach email footer — required by CAN-SPAM. A PO box or virtual mailbox is fine.
 * "Davis, CA" is a placeholder the owner chose 2026-10-22; CAN-SPAM wants a full postal address, so swap it when they have one.
 */
export const OUTREACH_MAILING_ADDRESS = 'Davis, CA'

/** Who signs outreach emails when no sender name is typed in (the daily cron never has one). "Anh" is the owner's chosen Vietnamese title. */
export const OUTREACH_SENDER_NAME = 'Anh James Hung'

/** In every email signature so owners can call or text to book a demo. */
export const OUTREACH_PHONE = '530-848-1587'

export const TRIAL_DAYS = 30
export const STARTING_PRICE = 29

export type TemplateId = 'intro' | 'setup_offer' | 'benefits' | 'last_note'

export const TEMPLATES: Record<TemplateId, {
  id: TemplateId
  step: number
  name: string
  description: string
  icon: string
  subjectFn: (salonName: string) => string
}> = {
  intro: {
    id: 'intro',
    step: 1,
    name: 'Online booking',
    description: 'Day 1 — first email: what GlowUp does, 30 days free, import offer, book a call',
    icon: '1',
    subjectFn: (name) => `Online booking for ${name}`,
  },
  setup_offer: {
    id: 'setup_offer',
    step: 2,
    name: "We'll set it up",
    description: 'Day 4 — reply with your website and we build the booking page; or book a call',
    icon: '2',
    subjectFn: (name) => `We'll set up ${name} for you`,
  },
  benefits: {
    id: 'benefits',
    step: 3,
    name: 'Fewer empty chairs',
    description: 'Day 9 — 24/7 booking, reminders, waitlist, AI receptionist; import offer or a call',
    icon: '3',
    subjectFn: (name) => `Fewer empty chairs at ${name}`,
  },
  last_note: {
    id: 'last_note',
    step: 4,
    name: 'Last note',
    description: 'Day 16 — polite last email; import and call offers stay open',
    icon: '4',
    subjectFn: () => 'Last note about GlowUp',
  },
}

/** Follow-ups in order, and how many days after the previous email each goes out. */
export const FOLLOW_UP_SEQUENCE: { templateId: TemplateId; daysAfterPrevious: number }[] = [
  { templateId: 'setup_offer', daysAfterPrevious: 3 },
  { templateId: 'benefits', daysAfterPrevious: 5 },
  { templateId: 'last_note', daysAfterPrevious: 7 },
]

// Rows written before the 2026-10-22 rewrite carry the old ids
const LEGACY_IDS: Record<string, TemplateId> = {
  feature_showcase: 'intro', success_story: 'benefits', limited_offer: 'intro', follow_up: 'last_note',
}
export function normalizeTemplateId(id: string | null | undefined): TemplateId {
  if (id && id in TEMPLATES) return id as TemplateId
  return (id && LEGACY_IDS[id]) || 'intro'
}

/**
 * First name to greet, or null. Leads from the database carry the business
 * name in owner_name, so a name equal to the salon's is not a person.
 */
export function greetingName(ownerName: string | null | undefined, salonName: string): string | null {
  const owner = (ownerName || '').trim()
  if (!owner || owner.toLowerCase() === salonName.trim().toLowerCase() || /^salon owner$/i.test(owner)) return null
  const first = owner.replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(/\s+/)[0]
  return first || null
}

type Paragraph = string | { bullets: string[] }

function body(templateId: TemplateId, salon: string, signupLink: string, sender: string): Paragraph[] {
  switch (templateId) {
    case 'intro':
      return [
        `I'm ${sender} with GlowUp, a booking app made for salons and spas.`,
        `With GlowUp, clients can book ${salon} online any time, get a reminder before their visit, and join a waitlist when you're full. You see everything on one calendar.`,
        `It's free for ${TRIAL_DAYS} days with no credit card, then plans start at $${STARTING_PRICE} a month. Try it here: ${signupLink}`,
        `Or simply reply with your website. We'll bring your services, prices and team into GlowUp for you, so you can review your own booking page before deciding anything.`,
        `Rather talk it through first? Reply with a day and time that works for you, and I'll set up a short call or video demo.`,
      ]
    case 'setup_offer':
      return [
        `Setting up new software is the part nobody has time for, so we do it for you.`,
        `Reply with ${salon}'s website. We'll read your service menu and prices, even if your menu is a picture, and build your booking page, team and hours. You get a private preview link to review. Nothing goes live and no client can book until you say so.`,
        `Like it? Create your login and it's yours. Don't? Just ignore it.`,
        `If you'd like to go over it together, reply with a good time and I'll book a short call or video demo with you.`,
      ]
    case 'benefits':
      return [
        `What owners tell us they like most about GlowUp:`,
        { bullets: [
          `Clients book at 10 pm instead of calling while you're with a client.`,
          `Reminders go out automatically, so fewer people forget.`,
          `When someone cancels, clients on your waitlist hear about the opening.`,
          `An AI receptionist answers common questions like prices, hours and parking.`,
        ] },
        `GlowUp also works in English, Spanish, Vietnamese, Korean and Chinese.`,
        `Want to see it with your own menu? Reply with your website and we'll import it into GlowUp, then send you a private preview of ${salon}'s booking page to review. Or reply with a good time and I'll walk you through it on a short call.`,
        `${TRIAL_DAYS} days free, no card: ${signupLink}`,
      ]
    case 'last_note':
      return [
        `I haven't heard back, so this is my last email. If the timing isn't right, no problem at all.`,
        `If you ever want online booking for ${salon}, the offer stands: send us your website and we'll import it into GlowUp free so you can review your booking page, or reply any time to set up a call. You can also start on your own at ${signupLink}`,
      ]
  }
}

function signOff(templateId: TemplateId, sender: string): string[] {
  const contact = `GlowUp · ${OUTREACH_PHONE} (call or text)`
  if (templateId === 'last_note') return ['Thanks for your time,', sender, contact]
  return [sender, contact]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const linkify = (escaped: string) => escaped.replace(/(https?:\/\/[^\s<]+?)([.,]?)(?=\s|$)/g, '<a href="$1" style="color:#7c3aed;">$1</a>$2')

export function renderTemplate(
  templateId: TemplateId,
  salonName: string,
  ownerName: string,
  signupLink: string,
  senderName: string | undefined,
  unsubscribeUrl: string,
): string {
  const id = normalizeTemplateId(templateId)
  const salon = salonName.trim()
  const sender = senderName?.trim() || OUTREACH_SENDER_NAME
  const first = greetingName(ownerName, salon)
  const p = (html: string) => `<p style="margin:0 0 16px;">${html}</p>`

  const paragraphs = body(id, salon, signupLink, sender).map(para =>
    typeof para === 'string'
      ? p(linkify(esc(para)))
      : `<ul style="margin:0 0 16px;padding-left:20px;">${para.bullets.map(b => `<li style="margin:0 0 6px;">${esc(b)}</li>`).join('')}</ul>`,
  ).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:560px;margin:0 auto;padding:24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222222;">
${p(`Hi ${esc(first || 'there')},`)}
${paragraphs}
${p(signOff(id, sender).map(esc).join('<br>').replace(OUTREACH_PHONE, `<a href="tel:+1${OUTREACH_PHONE.replace(/\D/g, '')}" style="color:#222222;">${OUTREACH_PHONE}</a>`))}
<p style="margin:32px 0 0;padding-top:12px;border-top:1px solid #e5e5e5;font-size:12px;line-height:1.5;color:#777777;">
GlowUp &middot; ${esc(OUTREACH_MAILING_ADDRESS || '[mailing address]')}<br>
Don't want these emails? <a href="${esc(unsubscribeUrl)}" style="color:#777777;">Unsubscribe</a>
</p>
</div>
</body>
</html>`
}

/** Plain-text version sent alongside the HTML — spam filters weigh its absence. */
export function renderTemplateText(
  templateId: TemplateId,
  salonName: string,
  ownerName: string,
  signupLink: string,
  senderName: string | undefined,
  unsubscribeUrl: string,
): string {
  const id = normalizeTemplateId(templateId)
  const salon = salonName.trim()
  const sender = senderName?.trim() || OUTREACH_SENDER_NAME
  const first = greetingName(ownerName, salon)
  const paragraphs = body(id, salon, signupLink, sender).map(para =>
    typeof para === 'string' ? para : para.bullets.map(b => `- ${b}`).join('\n'),
  )
  return [
    `Hi ${first || 'there'},`,
    ...paragraphs,
    signOff(id, sender).join('\n'),
    `--\nGlowUp · ${OUTREACH_MAILING_ADDRESS || '[mailing address]'}\nUnsubscribe: ${unsubscribeUrl}`,
  ].join('\n\n')
}

// ─── Texts ───
// Only for people who replied or asked to be texted — cold marketing texts to
// cell numbers need prior written consent (TCPA). Sent from the admin's own
// phone: GlowUp's Twilio toll-free number was rejected and doesn't deliver.
// No emoji (Android draws some with misleading content).

export type SmsTemplateId = 'sms_thanks' | 'sms_setup' | 'sms_preview_ready' | 'sms_last'

export const SMS_TEMPLATES: Record<SmsTemplateId, {
  id: SmsTemplateId
  name: string
  description: string
  /** Which link the text needs */
  link: 'signup' | 'preview'
}> = {
  sms_thanks: { id: 'sms_thanks', name: 'After they reply', description: 'Thank them and send the free-trial link', link: 'signup' },
  sms_setup: { id: 'sms_setup', name: 'Offer to set it up', description: 'Ask for their website so you can import it', link: 'signup' },
  sms_preview_ready: { id: 'sms_preview_ready', name: 'Preview is ready', description: 'After importing their site — paste their booking page link', link: 'preview' },
  sms_last: { id: 'sms_last', name: 'Last nudge', description: 'One final, polite text', link: 'signup' },
}

export function renderSmsTemplate(
  templateId: SmsTemplateId,
  opts: { salon: string; first?: string | null; sender?: string | null; link: string },
): string {
  const salon = opts.salon.trim() || 'your salon'
  const hi = opts.first?.trim() ? `Hi ${opts.first.trim()}` : 'Hi'
  const name = opts.first?.trim() || 'there'
  const sender = opts.sender?.trim()
  const stop = 'Reply STOP to opt out'
  // Phones linkify a bare domain; dropping "https://www." keeps a text to one 160-character segment
  const link = opts.link.trim().replace(/^https?:\/\/(www\.)?/i, '')
  switch (templateId) {
    case 'sms_thanks':
      return `${hi}, it's ${sender || 'the team'} from GlowUp. Thanks for getting back to us! Try GlowUp free for ${TRIAL_DAYS} days: ${link} ${stop}`
    case 'sms_setup':
      return `${opts.first?.trim() || 'Hi'}, want us to build ${salon}'s booking page for you? Text us your website and we'll send a preview. GlowUp. ${stop}`
    case 'sms_preview_ready':
      return `${hi}, ${salon}'s GlowUp booking page is ready to preview: ${link} It's not live until you say so. ${stop}`
    case 'sms_last':
      return `Last note from GlowUp, ${name}. If online booking isn't right for ${salon} now, no problem. If it is: ${link} ${stop}`
  }
}
