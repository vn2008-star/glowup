// ─── Website import: draft → tenant ───
// Turns a reviewed ImportDraft (lib/site-import) into a salon: tenant row in
// preview mode, a login-less owner the claim link binds to, the team, the
// services, hours, brand colour and an AI receptionist primed with the site's
// FAQ. Site images are copied into our storage. Any failure after the tenant
// insert deletes what was written.
//
// Used by /api/admin/import-site; kept out of the route file so it can be run
// from a script.

import type { SupabaseClient } from '@supabase/supabase-js'
import { siteBaseUrl } from '@/lib/site-url'
import { timezoneFromAddress } from '@/lib/tz'
import { fetchImage, DAYS, type ImportDraft } from '@/lib/site-import'
import { claimToken, newClaimNonce } from '@/lib/tenant-claim'

const UPLOAD_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

/** Copy a site image into our storage — their Wix/Squarespace URLs can vanish when they cancel. */
async function rehost(db: SupabaseClient, url: string | null, tenantId: string, folder: 'logos' | 'staff'): Promise<string | null> {
  if (!url) return null
  if (!/^https?:\/\//i.test(url)) return null
  const img = await fetchImage(url)
  const ext = img && UPLOAD_TYPES[img.type]
  if (!img || !ext) return null
  const path = `${tenantId}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await db.storage.from('uploads').upload(path, img.data, { contentType: img.type, upsert: false })
  if (error) {
    console.error('[import-site] rehost failed', url, error.message)
    return null
  }
  return db.storage.from('uploads').getPublicUrl(path).data.publicUrl
}

function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'salon'
}

async function uniqueSlug(db: SupabaseClient, name: string): Promise<string> {
  const base = slugify(name)
  const { data } = await db.from('tenants').select('slug').like('slug', `${base}%`)
  const taken = new Set((data || []).map(r => r.slug))
  if (!taken.has(base)) return base
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function claimUrl(tenantId: string, staffId: string, nonce: string): string {
  return `${siteBaseUrl()}/auth/signup?claim=${encodeURIComponent(claimToken(tenantId, staffId, nonce))}`
}

/** Description shown on the booking page: the site's words plus how it's priced. */
function serviceDescription(description: string, note: string): string | null {
  const n = note.trim()
  const priced = !n ? '' : /consult/i.test(n) ? 'Price on consultation.' : /starting|from/i.test(n) ? 'Starting price.' : `Priced ${n.replace(/^priced\s+/i, '')}.`
  return [description.trim(), priced].filter(Boolean).join(' ') || null
}

export async function createFromDraft(db: SupabaseClient, draft: ImportDraft, ownerIndex: number, admin: string) {
  const biz = draft.business
  const name = str(biz?.name, 120)
  if (!name) return { error: 'Business name is required' }

  const staffIn = (draft.staff || []).filter(s => s.include && str(s.name, 80))
  const services = (draft.services || []).filter(s => s.include && str(s.name, 120))
  if (services.length === 0) return { error: 'Include at least one service' }
  const owner = staffIn[ownerIndex] ?? null

  // Same website imported twice is almost always a mistake — and a duplicate
  // tenant is how "my settings aren't showing" happened before.
  const website = str(biz.website || draft.source_url, 300)
  if (website) {
    const host = (() => { try { return new URL(website).hostname.replace(/^www\./, '') } catch { return '' } })()
    if (host) {
      const { data: dup } = await db.from('tenants').select('id, name, slug').ilike('website', `%${host}%`).is('deleted_at', null).limit(1)
      if (dup?.length) return { error: `${dup[0].name} (/book/${dup[0].slug}) was already created from this website`, duplicate: dup[0] }
    }
  }

  const hours: Record<string, { open: string; close: string; closed: boolean }> = {}
  for (const d of DAYS) {
    const h = draft.hours?.[d]
    hours[d] = h && HHMM.test(h.open) && HHMM.test(h.close) && h.open < h.close
      ? { open: h.open, close: h.close, closed: !!h.closed }
      : { open: '09:00', close: '17:00', closed: true }
  }
  if (DAYS.every(d => hours[d].closed)) return { error: 'Set at least one open day' }

  const address = str(biz.address, 300)
  const timezone = str(biz.timezone, 60) || timezoneFromAddress(address) || 'America/Los_Angeles'
  const brand = /^#[0-9a-fA-F]{6}$/.test(biz.brand_color || '') ? biz.brand_color!.toLowerCase() : null

  // What the AI receptionist knows: the site's FAQ, who the providers are,
  // and any promotions the admin chose to keep.
  const faq = [
    ...(draft.faq || []).map(f => ({ q: str(f.q, 200), a: str(f.a, 500) })).filter(f => f.q && f.a),
    ...staffIn.filter(s => s.bio).map(s => ({ q: `Who is ${s.name}?`, a: `${s.name}${s.title ? `, ${s.title}` : ''}. ${str(s.bio, 600)}` })),
    ...(draft.promotions || []).filter(p => p.include).map(p => ({ q: `Do you have any specials or promotions?`, a: `${str(p.title, 150)}${p.details ? ` — ${str(p.details, 300)}` : ''}` })),
  ].slice(0, 30)

  const nonce = newClaimNonce()
  const settings: Record<string, unknown> = {
    business_hours: hours,
    ...(brand ? { brand_color: brand } : {}),
    ...(str(draft.special_instructions, 500) ? { special_instructions: str(draft.special_instructions, 500) } : {}),
    bot_config: {
      enabled: true,
      greeting: `Hi! Welcome to ${name} ✨ Ask me about our treatments, prices, or booking an appointment.`,
      faq,
      auto_booking: false,
    },
    import: {
      source_url: website || draft.source_url,
      imported_at: new Date().toISOString(),
      imported_by: admin,
      preview: true,
      claim_nonce: nonce,
      owner_email: str(biz.email, 200) || null,
      booking_platform: draft.booking_platform || null,
      by_appointment_only: !!biz.by_appointment_only,
      tagline: str(biz.tagline, 200) || null,
      about: str(biz.about, 2000) || null,
      socials: biz.socials || {},
      products: (biz.products || []).slice(0, 20),
    },
  }

  const { data: tenant, error: tErr } = await db.from('tenants').insert({
    name,
    slug: await uniqueSlug(db, name),
    business_type: str(biz.business_type, 40) || 'other',
    phone: str(biz.phone, 40) || null,
    email: str(biz.email, 200) || null,
    website: website || null,
    address: address || null,
    timezone,
    plan: 'free',
    subscription_status: 'trialing',
    settings,
  }).select('id, slug').single()
  if (tErr || !tenant) return { error: `Couldn't create the salon: ${tErr?.message || 'unknown error'}` }

  const rollback = async (why: string) => {
    await db.from('services').delete().eq('tenant_id', tenant.id)
    await db.from('staff').delete().eq('tenant_id', tenant.id)
    await db.from('tenants').delete().eq('id', tenant.id)
    return { error: why }
  }

  try {
    const [logoUrl, ...photoUrls] = await Promise.all([
      rehost(db, biz.logo_url, tenant.id, 'logos'),
      ...staffIn.map(s => rehost(db, s.photo_url, tenant.id, 'staff')),
    ])
    if (logoUrl) await db.from('tenants').update({ logo_url: logoUrl }).eq('id', tenant.id)

    // No owner on the site → a placeholder owner the claim link binds to
    const staffRows = (owner ? staffIn : [{ name: `${name} Owner`, title: '', bio: '', role: 'owner', specialties: [] as string[], photo_url: null, include: true }, ...staffIn])
      .map((s, i) => {
        const isOwner = owner ? s === owner : i === 0
        return {
          tenant_id: tenant.id,
          user_id: null,
          name: str(s.name, 80),
          // Only one login-less owner; other owners on the site become managers
          role: isOwner ? 'owner' : s.role === 'technician' ? 'technician' : 'manager',
          email: null,
          specialties: (s.specialties || []).slice(0, 8),
          photo_url: owner ? (photoUrls[i] ?? null) : (i === 0 ? null : photoUrls[i - 1] ?? null),
          is_active: true,
        }
      })
    const { data: insertedStaff, error: sErr } = await db.from('staff').insert(staffRows).select('id, role')
    if (sErr || !insertedStaff) return rollback(`Couldn't add the team: ${sErr?.message || 'unknown error'}`)
    const ownerRow = insertedStaff.find(r => r.role === 'owner')!

    const { error: svcErr } = await db.from('services').insert(services.map((s, i) => ({
      tenant_id: tenant.id,
      name: str(s.name, 120),
      category: str(s.category, 60) || 'Services',
      description: serviceDescription(str(s.description, 600), str(s.price_note, 60)),
      duration_minutes: Math.min(480, Math.max(5, Math.round(Number(s.duration_minutes) || 60))),
      price: Math.max(0, Math.round((Number(s.price) || 0) * 100) / 100),
      is_active: true,
      sort_order: i,
      price_addons: (s.addons || []).filter(a => a.label && Number(a.price) >= 0).map(a => ({ label: str(a.label, 60), price: Number(a.price) })),
    })))
    if (svcErr) return rollback(`Couldn't add services: ${svcErr.message}`)

    await db.from('tenants').update({
      settings: { ...settings, import: { ...(settings.import as object), owner_staff_id: ownerRow.id } },
    }).eq('id', tenant.id)

    return {
      data: {
        tenant_id: tenant.id,
        slug: tenant.slug,
        booking_url: `${siteBaseUrl()}/book/${tenant.slug}`,
        claim_url: claimUrl(tenant.id, ownerRow.id, nonce),
        services: services.length,
        staff: insertedStaff.length,
        logo: !!logoUrl,
      },
    }
  } catch (e) {
    console.error('[import-site] create failed', e)
    return rollback(`Import failed: ${e instanceof Error ? e.message : 'unknown error'}`)
  }
}
