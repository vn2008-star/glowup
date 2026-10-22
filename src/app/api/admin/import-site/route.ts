import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin'
import { timezoneFromAddress } from '@/lib/tz'
import { crawlSite, extractDraft, normalizeSiteUrl, type ImportDraft } from '@/lib/site-import'
import { createFromDraft, claimUrl } from '@/lib/site-import-create'
import { newClaimNonce, readImportMeta } from '@/lib/tenant-claim'

// ─── Import a business from its website (platform admin only) ───
// scan       { url }                         → crawl + AI extraction → draft
// create     { draft, owner_index }          → tenant, owner row, staff, services, settings
// claim-link { tenant_id, rotate? }          → the owner's signup link
// set-preview{ tenant_id, preview }          → booking page preview on/off
// GET                                        → salons created by the importer
//
// The new tenant has no login until the owner signs up through the claim
// link (lib/tenant-claim). Until it goes live its booking page is a preview
// that refuses bookings, so a real client can't book a salon that hasn't
// agreed to use GlowUp yet.

export const maxDuration = 60

const svc = () => createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function adminEmail(): Promise<string | null> {
  const supabase = await createClient()
  try {
    const { data } = await supabase.auth.getClaims()
    const email = data?.claims?.email as string | undefined
    return email && isAdminEmail(email) ? email : null
  } catch {
    return null
  }
}

export async function GET() {
  if (!await adminEmail()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = svc()
  const { data, error } = await db.from('tenants')
    .select('id, name, slug, website, logo_url, created_at, settings')
    .not('settings->import', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    data: (data || []).map(t => {
      const meta = readImportMeta(t.settings) || {}
      return {
        id: t.id, name: t.name, slug: t.slug, website: t.website, logo_url: t.logo_url, created_at: t.created_at,
        preview: meta.preview === true, claimed_at: meta.claimed_at || null, claimed_by: meta.claimed_by || null,
        owner_email: meta.owner_email || null,
      }
    }),
  })
}

export async function POST(request: Request) {
  const admin = await adminEmail()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const db = svc()

  switch (body.action) {
    case 'scan': {
      const url = normalizeSiteUrl(String(body.url || ''))
      if (!url) return NextResponse.json({ error: 'Enter a public website address, e.g. peachy-skincare.com' }, { status: 400 })
      const crawl = await crawlSite(url)
      if (crawl.pages.length === 0) {
        return NextResponse.json({ error: `Couldn't load ${url.hostname}: ${crawl.failed[0]?.reason || 'no response'}` }, { status: 422 })
      }
      try {
        const draft = await extractDraft(crawl, timezoneFromAddress)
        return NextResponse.json({ data: draft })
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'AI extraction failed' }, { status: 502 })
      }
    }

    case 'create': {
      if (!body.draft || typeof body.draft !== 'object') return NextResponse.json({ error: 'Missing draft' }, { status: 400 })
      const result = await createFromDraft(db, body.draft as ImportDraft, Number(body.owner_index ?? -1), admin)
      return NextResponse.json(result, { status: 'error' in result ? 400 : 200 })
    }

    case 'claim-link': {
      const { data: t } = await db.from('tenants').select('id, settings').eq('id', String(body.tenant_id || '')).maybeSingle()
      const meta = readImportMeta(t?.settings)
      if (!t || !meta?.owner_staff_id) return NextResponse.json({ error: 'Not an imported salon' }, { status: 404 })
      if (meta.claimed_at) return NextResponse.json({ error: `Already claimed by ${meta.claimed_by}` }, { status: 409 })
      let nonce = meta.claim_nonce
      if (!nonce || body.rotate) {
        nonce = newClaimNonce()
        await db.from('tenants').update({ settings: { ...(t.settings as object), import: { ...meta, claim_nonce: nonce } } }).eq('id', t.id)
      }
      return NextResponse.json({ data: { claim_url: claimUrl(t.id, meta.owner_staff_id, nonce) } })
    }

    case 'set-preview': {
      const { data: t } = await db.from('tenants').select('id, settings').eq('id', String(body.tenant_id || '')).maybeSingle()
      const meta = readImportMeta(t?.settings)
      if (!t || !meta) return NextResponse.json({ error: 'Not an imported salon' }, { status: 404 })
      const { error } = await db.from('tenants')
        .update({ settings: { ...(t.settings as object), import: { ...meta, preview: body.preview === true } } })
        .eq('id', t.id)
      return NextResponse.json({ success: !error, error: error?.message })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
