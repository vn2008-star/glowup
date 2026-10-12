import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { rateLimited, clientIp, TOO_MANY } from '@/lib/rate-limit'
import { resolveConsentForm, consentFormHash, parseConsentToken, readSignedConsent, consentState, SIGNATURE_BUCKET, type SignedConsent } from '@/lib/consent'

// Public (token-authenticated) consent form API. See lib/consent.ts.

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Resolve a consent token to the salon + client it belongs to. */
async function resolveToken(db: ReturnType<typeof svc>, token: string) {
  const parsed = parseConsentToken(token)
  if (!parsed) return null
  let tenantId: string, clientId: string
  if (parsed.kind === 'manage') {
    const { data: apt } = await db.from('appointments').select('tenant_id, client_id').eq('manage_token', parsed.manageToken).maybeSingle()
    if (!apt?.client_id) return null
    tenantId = apt.tenant_id; clientId = apt.client_id
  } else {
    tenantId = parsed.tenantId; clientId = parsed.clientId
  }
  const [{ data: tenant }, { data: client }] = await Promise.all([
    db.from('tenants').select('id, name, slug, logo_url, phone, settings').eq('id', tenantId).maybeSingle(),
    db.from('clients').select('id, first_name, last_name, preferences').eq('id', clientId).eq('tenant_id', tenantId).maybeSingle(),
  ])
  if (!tenant || !client) return null
  return { tenant, client }
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || ''
  const db = svc()
  const r = await resolveToken(db, token)
  if (!r) return NextResponse.json({ error: 'This link is not valid' }, { status: 404 })
  const settings = (r.tenant.settings || {}) as Record<string, unknown>
  const form = resolveConsentForm(settings)
  const existing = readSignedConsent(r.client.preferences)
  return NextResponse.json({
    business: { name: r.tenant.name, slug: r.tenant.slug, logo_url: r.tenant.logo_url, phone: r.tenant.phone, brand_color: typeof settings.brand_color === 'string' ? settings.brand_color : null },
    client: { first_name: r.client.first_name, last_name: r.client.last_name },
    form: { enabled: form.enabled, questions: form.questions, terms: form.terms, photo_consent: form.photo_consent },
    state: consentState(r.client.preferences, form),
    existing: existing ? { signed_at: existing.signed_at, name: existing.name, answers: existing.answers, allergies: existing.allergies, photo_consent: existing.photo_consent } : null,
  })
}

export async function POST(request: Request) {
  if (rateLimited(`consent:${clientIp(request)}`, 20, 10 * 60 * 1000)) return NextResponse.json(TOO_MANY, { status: 429 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { token, name, answers, allergies, photo_consent, signature, via } = body as Record<string, unknown>

  const db = svc()
  const r = await resolveToken(db, String(token || ''))
  if (!r) return NextResponse.json({ error: 'This link is not valid' }, { status: 404 })
  const form = resolveConsentForm((r.tenant.settings || {}) as Record<string, unknown>)

  const typedName = String(name || '').trim().slice(0, 120)
  if (typedName.length < 2) return NextResponse.json({ error: 'Please type your full name' }, { status: 400 })
  const cleanAnswers: Record<string, boolean> = {}
  for (const q of form.questions) {
    const v = (answers as Record<string, unknown> | null)?.[q.id]
    if (typeof v !== 'boolean') return NextResponse.json({ error: 'Please answer every question' }, { status: 400 })
    cleanAnswers[q.id] = v
  }
  const sig = typeof signature === 'string' ? signature : ''
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 400_000) {
    return NextResponse.json({ error: 'Please sign in the box' }, { status: 400 })
  }

  // Signature → private bucket (never into the JSON; it would bloat every
  // client list response, and it's personal data)
  let signaturePath: string | null = null
  try {
    const bytes = Buffer.from(sig.split(',')[1], 'base64')
    const path = `${r.tenant.id}/${r.client.id}/${Date.now()}.png`
    let { error } = await db.storage.from(SIGNATURE_BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false })
    if (error && /not found|bucket/i.test(error.message || '')) {
      await db.storage.createBucket(SIGNATURE_BUCKET, { public: false })
      ;({ error } = await db.storage.from(SIGNATURE_BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false }))
    }
    if (!error) signaturePath = path
    else console.error('[consent] signature upload failed:', error.message)
  } catch (err) {
    console.error('[consent] signature upload error:', err)
  }
  if (!signaturePath) return NextResponse.json({ error: 'Could not save the signature. Please try again.' }, { status: 500 })

  const signed: SignedConsent = {
    signed_at: new Date().toISOString(),
    name: typedName,
    answers: cleanAnswers,
    allergies: String(allergies || '').trim().slice(0, 1000),
    photo_consent: form.photo_consent ? photo_consent === true : false,
    form_hash: consentFormHash(form),
    signature_path: signaturePath,
    via: via === 'kiosk' ? 'kiosk' : 'web',
  }
  const prefs = (r.client.preferences && typeof r.client.preferences === 'object' ? r.client.preferences : {}) as Record<string, unknown>
  const update: Record<string, unknown> = { preferences: { ...prefs, consent: signed } }
  // Allergies typed here are the ones the technician needs on the profile
  if (signed.allergies) update.allergies = signed.allergies.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).slice(0, 20)
  const { error } = await db.from('clients').update(update).eq('id', r.client.id).eq('tenant_id', r.tenant.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, signed_at: signed.signed_at })
}
