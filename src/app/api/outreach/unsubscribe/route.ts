import { createClient } from '@supabase/supabase-js'
import { unsubscribe, verifyUnsubscribe } from '@/lib/outreach-send'

// ─── Unsubscribe from GlowUp sales emails ───
// GET shows a confirm button rather than unsubscribing on the spot: email
// security scanners open every link in a message, and would otherwise
// unsubscribe people who never clicked. POST does it — both from that button
// and from mail apps' one-click unsubscribe (List-Unsubscribe-Post).

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function page(title: string, body: string, status = 200): Response {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f7f7f8;font-family:Arial,Helvetica,sans-serif;color:#222;">
<div style="max-width:440px;margin:64px auto;padding:32px 24px;background:#fff;border-radius:12px;border:1px solid #e5e5e5;text-align:center;">
<h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>${body}</div></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function params(url: URL) {
  return { email: (url.searchParams.get('e') || '').trim().toLowerCase(), sig: url.searchParams.get('s') || '' }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const { email, sig } = params(url)
  if (!email || !verifyUnsubscribe(email, sig)) return page('Link not valid', '<p>This unsubscribe link is incomplete. Reply to any GlowUp email with "unsubscribe" and we\'ll remove you.</p>', 400)
  return page('Unsubscribe from GlowUp emails?',
    `<p style="margin:0 0 20px;color:#555;">We'll stop sending sales emails to <strong>${esc(email)}</strong>.</p>
<form method="post" action="${esc(url.pathname + url.search)}"><button type="submit" style="padding:12px 28px;font-size:15px;border:0;border-radius:8px;background:#7c3aed;color:#fff;cursor:pointer;">Unsubscribe</button></form>`)
}

export async function POST(request: Request) {
  const { email, sig } = params(new URL(request.url))
  if (!email || !verifyUnsubscribe(email, sig)) return page('Link not valid', '<p>This unsubscribe link is incomplete.</p>', 400)
  await unsubscribe(svc(), email)
  return page("You're unsubscribed", `<p style="margin:0;color:#555;">We won't send sales emails to <strong>${esc(email)}</strong> again.</p>`)
}
