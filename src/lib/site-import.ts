// ─── Import a business from its existing website ───
// Crawls a salon's public site (home + the nav pages worth reading), hands the
// text and the images that look like price menus to Gemini, and gets back a
// draft: business profile, hours, services with prices, team, FAQ, promotions.
// Nothing is written here — the admin reviews the draft and /api/admin/
// import-site turns it into a tenant.
//
// Many small-salon sites (Wix especially) publish their price list only as a
// picture, so the menu images go to the model as images, not alt text.

const GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest']
const geminiUrl = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

const MAX_PAGES = 14
const MAX_TEXT_PER_PAGE = 9000
const MAX_MENU_IMAGES = 5
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const FETCH_TIMEOUT_MS = 12000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 GlowUpImporter'

// Pages worth a fetch, best first. Anything else on the same host comes after.
const PAGE_PRIORITY = /(service|price|pricing|menu|treatment|rate|team|staff|about|our-|contact|promo|special|faq|book|hours|location|provider|artist|stylist)/i
const SKIP_PATH = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mov)$|\/(cart|checkout|account|login|wp-admin|wp-login|feed|tag|category|author|blog\/page)\b/i
const MENU_IMAGE_HINT = /(price|pricing|menu|service|rate|list|sheet|special|promo|treatment|offer)/i
const LOGO_HINT = /logo/i

export const BOOKING_PLATFORMS: [RegExp, string][] = [
  [/vagaro\.com/i, 'Vagaro'], [/booksy\.com/i, 'Booksy'], [/fresha\.com/i, 'Fresha'],
  [/glossgenius\.com/i, 'GlossGenius'], [/squareup\.com\/appointments|square\.site|book\.squareup/i, 'Square Appointments'],
  [/schedulicity\.com/i, 'Schedulicity'], [/acuityscheduling\.com/i, 'Acuity'], [/mindbodyonline\.com|mindbody\.io/i, 'Mindbody'],
  [/boulevard\.io|joinblvd\.com/i, 'Boulevard'], [/styleseat\.com/i, 'StyleSeat'], [/zenoti\.com/i, 'Zenoti'],
  [/setmore\.com/i, 'Setmore'], [/calendly\.com/i, 'Calendly'], [/janeapp\.com/i, 'Jane'], [/aestheticspro\.com/i, 'AestheticsPro'],
]

export type CrawledImage = { url: string; alt: string; page: string }
export type CrawledPage = { url: string; title: string; text: string }

export type CrawlResult = {
  baseUrl: string
  pages: CrawledPage[]
  images: CrawledImage[]
  menuImages: CrawledImage[]
  logoCandidates: string[]
  ogImage: string | null
  phones: string[]
  emails: string[]
  socials: Record<string, string>
  bookingPlatform: string | null
  jsonLd: unknown[]
  themeColor: string | null
  /** Saturated colours used on the site, most frequent first */
  palette: string[]
  failed: { url: string; reason: string }[]
}

export type DayHours = { open: string; close: string; closed: boolean }

export type DraftService = {
  include: boolean
  name: string
  category: string
  description: string
  price: number
  /** "per unit", "per vial", "starting at" … kept for the description */
  price_note: string
  duration_minutes: number
  /** True when the site didn't say and the model estimated it */
  duration_estimated: boolean
  addons: { label: string; price: number }[]
}

export type DraftStaff = {
  include: boolean
  name: string
  title: string
  bio: string
  photo_url: string | null
  role: 'owner' | 'manager' | 'technician'
  specialties: string[]
}

export type ImportDraft = {
  source_url: string
  business: {
    name: string
    tagline: string
    about: string
    business_type: string
    phone: string
    email: string
    address: string
    website: string
    timezone: string
    logo_url: string | null
    brand_color: string | null
    palette: string[]
    by_appointment_only: boolean
    hours_text: string
    socials: Record<string, string>
    products: string[]
  }
  hours: Record<string, DayHours>
  hours_estimated: boolean
  services: DraftService[]
  staff: DraftStaff[]
  faq: { q: string; a: string }[]
  promotions: { title: string; details: string; include: boolean }[]
  special_instructions: string
  booking_platform: string | null
  warnings: string[]
  pages_read: string[]
  menu_images: string[]
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// ─── Fetching ───

async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Only public http(s) hosts — the server fetches whatever an admin pastes. */
export function normalizeSiteUrl(input: string): URL | null {
  let raw = input.trim()
  if (!raw) return null
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const h = u.hostname.toLowerCase()
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return null
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return null // no raw IPs (metadata endpoints, LAN)
  u.hash = ''
  return u
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section|\/span)\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Wix serves resized/AVIF variants at …/v1/fill/…; the bare media URL is the original JPEG/PNG. */
function canonicalImage(src: string, base: URL): string | null {
  let u: URL
  try { u = new URL(decodeEntities(src), base) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.hostname === 'static.wixstatic.com') {
    const m = u.pathname.match(/^\/media\/([^/]+)/)
    if (m) return `https://static.wixstatic.com/media/${m[1]}`
  }
  // Squarespace: drop ?format=… so we get the full-size original
  if (u.hostname.endsWith('squarespace-cdn.com')) u.search = ''
  return u.toString()
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return m ? (m[2] ?? m[3] ?? '') : ''
}

function parsePage(html: string, pageUrl: URL, out: CrawlResult, links: Set<string>) {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim())
  out.pages.push({ url: pageUrl.toString(), title, text: htmlToText(html).slice(0, MAX_TEXT_PER_PAGE) })

  for (const m of html.matchAll(/<a\s[^>]*>/gi)) {
    const href = attr(m[0], 'href')
    if (!href) continue
    if (/^tel:/i.test(href)) { out.phones.push(decodeURIComponent(href.slice(4)).trim()); continue }
    if (/^mailto:/i.test(href)) { out.emails.push(decodeURIComponent(href.slice(7)).split('?')[0].trim()); continue }
    let u: URL
    try { u = new URL(decodeEntities(href), pageUrl) } catch { continue }
    const host = u.hostname.replace(/^www\./, '')
    for (const [re, name] of BOOKING_PLATFORMS) if (re.test(u.toString())) out.bookingPlatform ||= name
    if (/instagram\.com$/.test(host) && u.pathname.length > 1) out.socials.instagram ||= u.toString()
    else if (/facebook\.com$/.test(host) && u.pathname.length > 1 && !/sharer|plugins/.test(u.pathname)) out.socials.facebook ||= u.toString()
    else if (/tiktok\.com$/.test(host)) out.socials.tiktok ||= u.toString()
    else if (/yelp\.com$/.test(host)) out.socials.yelp ||= u.toString()
    else if (/(maps\.google|goo\.gl\/maps|google\.com\/maps|maps\.app\.goo\.gl)/.test(u.toString())) out.socials.google_maps ||= u.toString()
    if (host === new URL(out.baseUrl).hostname.replace(/^www\./, '')) {
      u.hash = ''; u.search = ''
      if (!SKIP_PATH.test(u.pathname)) links.add(u.toString().replace(/\/$/, ''))
    }
  }

  for (const m of html.matchAll(/<img\s[^>]*>/gi)) {
    const src = attr(m[0], 'src') || attr(m[0], 'data-src')
    if (!src || src.startsWith('data:')) continue
    const url = canonicalImage(src, pageUrl)
    if (!url || out.images.some(i => i.url === url)) continue
    const alt = decodeEntities(attr(m[0], 'alt'))
    out.images.push({ url, alt, page: pageUrl.toString() })
  }

  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i)
  if (og && !out.ogImage) out.ogImage = canonicalImage(attr(og[0], 'content'), pageUrl)
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]*>/i)
  if (theme && !out.themeColor) out.themeColor = attr(theme[0], 'content') || null

  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.jsonLd.push(JSON.parse(m[1])) } catch { /* malformed JSON-LD is common; skip */ }
  }
  // Inline-script sites (Wix) also embed booking widgets as plain strings
  if (!out.bookingPlatform) for (const [re, name] of BOOKING_PLATFORMS) if (re.test(html)) { out.bookingPlatform = name; break }
}

// Site builders' own UI colours, not the salon's
const BUILDER_COLORS = new Set(['#116dff', '#0099ef', '#3899ec', '#2f5dff', '#4285f4', '#1877f2', '#e1306c'])

/** Tally saturated, mid-lightness colours — the brand accent hides among greys and whites. */
function countColors(html: string, counts: Map<string, number>) {
  const add = (r: number, g: number, b: number) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const light = (max + min) / 510
    const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255))
    if (sat < 0.45 || light < 0.2 || light > 0.85) return
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
    if (BUILDER_COLORS.has(hex)) return
    counts.set(hex, (counts.get(hex) || 0) + 1)
  }
  for (const m of html.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const n = parseInt(m[1], 16)
    add(n >> 16, (n >> 8) & 255, n & 255)
  }
  for (const m of html.matchAll(/rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/g)) add(+m[1], +m[2], +m[3])
}

export async function crawlSite(start: URL): Promise<CrawlResult> {
  const out: CrawlResult = {
    baseUrl: start.origin, pages: [], images: [], menuImages: [], logoCandidates: [], ogImage: null,
    phones: [], emails: [], socials: {}, bookingPlatform: null, jsonLd: [], themeColor: null, palette: [], failed: [],
  }
  const colorCounts = new Map<string, number>()
  const links = new Set<string>()
  const seen = new Set<string>()

  const fetchPage = async (url: string) => {
    seen.add(url)
    try {
      const res = await fetchWithTimeout(url, 'text/html,application/xhtml+xml')
      const type = res.headers.get('content-type') || ''
      if (!res.ok) { out.failed.push({ url, reason: `HTTP ${res.status}` }); return }
      if (!type.includes('html')) { out.failed.push({ url, reason: `not HTML (${type})` }); return }
      // Redirect to a different host (e.g. http→https www) moves the base too
      const finalUrl = new URL(res.url || url)
      if (out.pages.length === 0) out.baseUrl = finalUrl.origin
      const html = await res.text()
      parsePage(html, finalUrl, out, links)
      countColors(html, colorCounts)
    } catch (e) {
      out.failed.push({ url, reason: e instanceof Error ? (e.name === 'AbortError' ? 'timed out' : e.message) : 'fetch failed' })
    }
  }

  await fetchPage(start.toString())
  if (out.pages.length === 0) return out

  const ranked = [...links]
    .filter(l => !seen.has(l) && l !== out.baseUrl)
    .sort((a, b) => Number(PAGE_PRIORITY.test(new URL(b).pathname)) - Number(PAGE_PRIORITY.test(new URL(a).pathname)))
    .slice(0, MAX_PAGES - 1)
  // A few at a time — small business hosting rate-limits hard
  for (let i = 0; i < ranked.length; i += 4) {
    await Promise.all(ranked.slice(i, i + 4).map(fetchPage))
  }

  out.phones = [...new Set(out.phones.filter(p => p.replace(/\D/g, '').length >= 10))]
  out.emails = [...new Set(out.emails.map(e => e.toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)))]

  const imgName = (i: CrawledImage) => `${decodeURIComponent(i.url.split('/').pop() || '')} ${i.alt}`
  // A menu image is one whose name/alt says so, or an image on a pricing page
  out.menuImages = out.images
    .filter(i => !LOGO_HINT.test(imgName(i)))
    .map(i => ({ i, score: (MENU_IMAGE_HINT.test(imgName(i)) ? 2 : 0) + (/(price|pricing|menu|service|promo|special)/i.test(new URL(i.page).pathname) ? 1 : 0) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.i)
    .slice(0, MAX_MENU_IMAGES)
  out.palette = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 6)
  out.logoCandidates = out.images.filter(i => LOGO_HINT.test(imgName(i))).map(i => i.url).slice(0, 3)
  return out
}

// ─── Images ───

const MODEL_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function fetchImage(url: string): Promise<{ data: Buffer; type: string } | null> {
  try {
    const res = await fetchWithTimeout(url, 'image/jpeg,image/png,image/webp;q=0.9')
    if (!res.ok) return null
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_IMAGE_BYTES) {
      // Wix originals run huge (Peachy's logo PNG is 6.7 MB); ask Wix for a
      // 1600px rendition instead of giving up on the image
      const m = url.match(/^https:\/\/static\.wixstatic\.com\/media\/([^/]+)$/)
      return m ? fetchImage(`${url}/v1/fit/w_1600,h_1600,q_90/${m[1]}`) : null
    }
    if (buf.length === 0) return null
    return { data: buf, type }
  } catch {
    return null
  }
}

// ─── Extraction ───
// Two Gemini calls in parallel: the menu (services + promotions, needs the
// images) and the profile (business, hours, team, FAQ — text only). One call
// asking for everything ran 80s+ on Peachy's site; split, each finishes inside
// a 60s function.

const SHARED_RULES = `You turn a beauty/wellness business's website into setup data for GlowUp, a salon booking app.
Use ONLY facts from the provided pages and images. Never invent prices, staff, phone numbers or hours.`

const MENU_PROMPT = `${SHARED_RULES}
Your job: the SERVICE MENU and PROMOTIONS.
- Price menus are often images: read every service and price from them carefully.
- One service per bookable thing. When one line has variants with different prices (e.g. "Full Face $300 / Spot $100", or "Face & Neck $120, Eyes $80"), make one service per variant named "<Service> — <Variant>".
- Unit pricing ("$18/unit", "$750/vial"): price = that number, price_note = "per unit"/"per vial".
- "starting at"/"from" prices: price = the number, price_note = "starting at".
- Treatments the site describes but never prices: include them with price = 0, price_note = "price on consultation".
- duration_minutes: the site's duration if stated (duration_estimated=false); otherwise a realistic appointment length (facial 60, brow wax 15, brow tint 15, Botox 30, filler 45, chemical peel 45, HydraFacial 60, laser full face 45, IPL 45, consultation 30) with duration_estimated=true.
- category: short groups like "Facials", "Injectables", "Peels", "Laser & Light", "Waxing & Brows", "Skin Treatments", "Consultations", "Nails", "Hair", "Lashes", "Massage".
- description: 1-2 sentences in the site's own wording about that treatment (what it treats, products used). If the site says nothing about it, "" — never filler like "Professional facial treatment."
- promotions: any specials or discounts, details exactly as written.`

const PROFILE_PROMPT = `${SHARED_RULES}
Your job: the BUSINESS PROFILE, HOURS, TEAM and FAQ. (Services are handled separately.)
- staff: every named provider. title = credentials/role as written (e.g. "R.N., Aesthetic Nurse Injector", "M.D."). role "owner" for anyone the site says owns/operates the business, otherwise "technician". bio = their bio from the site kept close to verbatim (up to ~1200 characters). specialties = treatment categories their bio mentions (e.g. "Injectables", "Laser & Light", "Facials"). photo_hint = the filename or alt text of their photo from the image list.
- hours: 24h "HH:MM" per day. If the site only says "By appointment only" or gives no hours, hours_found=false and hours empty.
- faq: 5-10 short Q&A an AI receptionist could answer from the site (treatments offered, products used, who performs injections and their credentials, location, how to book). Answers 1-2 sentences.
- special_instructions: arrival notes for clients if the site has any (suite number, parking, arrive early), else "".
- business_type: one of med_spa, skin_care, nail_salon, hair_salon, barbershop, lash_brow, massage, day_spa, other.
- brand_color: the site's main accent colour as #RRGGBB, chosen from the accent colours listed, else "".`

const MENU_SCHEMA = {
  type: 'OBJECT',
  properties: {
    services: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' }, category: { type: 'STRING' }, description: { type: 'STRING' }, price: { type: 'NUMBER' },
          price_note: { type: 'STRING' }, duration_minutes: { type: 'INTEGER' }, duration_estimated: { type: 'BOOLEAN' },
        },
        required: ['name', 'category', 'price', 'duration_minutes', 'duration_estimated'],
      },
    },
    promotions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, details: { type: 'STRING' } }, required: ['title'] } },
  },
  required: ['services', 'promotions'],
}

const PROFILE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    business: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' }, tagline: { type: 'STRING' }, about: { type: 'STRING' }, business_type: { type: 'STRING' },
        phone: { type: 'STRING' }, email: { type: 'STRING' }, address: { type: 'STRING' }, brand_color: { type: 'STRING' },
        by_appointment_only: { type: 'BOOLEAN' }, hours_text: { type: 'STRING' },
        products: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['name', 'phone', 'email', 'address', 'business_type'],
    },
    hours_found: { type: 'BOOLEAN' },
    hours: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { day: { type: 'STRING' }, open: { type: 'STRING' }, close: { type: 'STRING' }, closed: { type: 'BOOLEAN' } }, required: ['day', 'closed'] },
    },
    staff: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' }, title: { type: 'STRING' }, bio: { type: 'STRING' }, role: { type: 'STRING' },
          photo_hint: { type: 'STRING' }, specialties: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['name', 'role', 'bio'],
      },
    },
    faq: { type: 'ARRAY', items: { type: 'OBJECT', properties: { q: { type: 'STRING' }, a: { type: 'STRING' } }, required: ['q', 'a'] } },
    special_instructions: { type: 'STRING' },
  },
  required: ['business', 'hours_found', 'staff', 'faq'],
}

type MenuResult = {
  services: Partial<DraftService>[]
  promotions: { title: string; details?: string }[]
}
type ProfileResult = {
  business: Partial<ImportDraft['business']>
  hours_found: boolean
  hours?: { day: string; open?: string; close?: string; closed: boolean }[]
  staff: (Partial<DraftStaff> & { photo_hint?: string })[]
  faq: { q: string; a: string }[]
  special_instructions?: string
}

const GEMINI_TIMEOUT_MS = 45000

async function callGemini<T>(systemPrompt: string, schema: unknown, parts: unknown[], deadline: number): Promise<T> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not configured')
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 12000 },
  })
  let lastErr = ''
  // flash-latest reads image menus better but 503s under load — one shot at it,
  // then lite, which gets a retry
  for (const model of GEMINI_MODELS) {
    const attempts = model === GEMINI_MODELS[GEMINI_MODELS.length - 1] ? 2 : 1
    for (let attempt = 0; attempt < attempts; attempt++) {
      const remaining = deadline - Date.now()
      if (remaining < 8000) throw new Error(`AI extraction ran out of time — ${lastErr || 'try again'}`)
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), Math.min(GEMINI_TIMEOUT_MS, remaining))
      try {
        const res = await fetch(`${geminiUrl(model)}?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal })
        if (res.ok) {
          const data = await res.json()
          const text: string | undefined = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('')
          if (text) {
            try { return JSON.parse(text) as T } catch { lastErr = `${model} returned malformed JSON` }
          } else {
            lastErr = `${model} returned no content (${data.candidates?.[0]?.finishReason || 'unknown'})`
          }
          continue
        }
        lastErr = `${model} HTTP ${res.status}`
        console.error('[site-import]', lastErr, (await res.text()).slice(0, 200))
        if (res.status !== 503 && res.status !== 429 && res.status !== 500) break
      } catch (e) {
        lastErr = `${model} ${e instanceof Error && e.name === 'AbortError' ? 'timed out' : 'request failed'}`
        console.error('[site-import]', lastErr)
      } finally {
        clearTimeout(timer)
      }
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  throw new Error(`AI extraction failed — ${lastErr}`)
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/
const pad = (t: string) => { const m = t.match(HHMM); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null }

/** Default hours for "by appointment only" — the admin adjusts before creating. */
export function defaultHours(): Record<string, DayHours> {
  return Object.fromEntries(DAYS.map(d => [d, { open: '10:00', close: '18:00', closed: d === 'Sunday' }]))
}

function cleanMoney(n: unknown): number {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0
}

function jsonLdBusiness(jsonLd: unknown[]): { phone?: string; email?: string; address?: string; name?: string } {
  const flat: Record<string, unknown>[] = []
  const walk = (n: unknown) => {
    if (Array.isArray(n)) n.forEach(walk)
    else if (n && typeof n === 'object') {
      flat.push(n as Record<string, unknown>)
      const g = (n as Record<string, unknown>)['@graph']
      if (g) walk(g)
    }
  }
  walk(jsonLd)
  const biz = flat.find(n => /LocalBusiness|BeautySalon|DaySpa|HealthAndBeautyBusiness|MedicalBusiness|HairSalon|NailSalon|Organization/i.test(String(n['@type'] || '')))
  if (!biz) return {}
  const a = biz.address as Record<string, string> | string | undefined
  const address = typeof a === 'string' ? a
    : a ? [a.streetAddress, a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ') : undefined
  return { name: biz.name as string, phone: biz.telephone as string, email: biz.email as string, address }
}

function formatPhone(p: string): string {
  const d = p.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p.trim()
}

export async function extractDraft(crawl: CrawlResult, timezoneFor: (address: string) => string | null, budgetMs = 52000): Promise<ImportDraft> {
  const deadline = Date.now() + budgetMs
  const warnings: string[] = []
  const pagesText = crawl.pages.map(p => `===== PAGE ${p.url} — ${p.title}\n${p.text}`).join('\n\n')
  const imageList = `Images on the site (filename | alt):\n` +
    crawl.images.slice(0, 60).map(i => `- ${decodeURIComponent(i.url.split('/').pop() || '')} | ${i.alt}`).join('\n')

  const menuParts: unknown[] = [{ text: `Website: ${crawl.baseUrl}\n\n${pagesText}` }]
  const menuImages: string[] = []
  const fetched = await Promise.all(crawl.menuImages.map(async img => ({ img, f: await fetchImage(img.url) })))
  for (const { img, f } of fetched) {
    if (!f || !MODEL_IMAGE_TYPES.has(f.type)) continue
    menuParts.push({ text: `Image from ${img.page} (${img.alt || 'no alt text'}) — may be a price menu or promotion:` })
    menuParts.push({ inline_data: { mime_type: f.type, data: f.data.toString('base64') } })
    menuImages.push(img.url)
  }

  const profileParts: unknown[] = [{
    text: `Website: ${crawl.baseUrl}\n` +
      (crawl.phones.length ? `tel: links: ${crawl.phones.join(', ')}\n` : '') +
      (crawl.emails.length ? `mailto: links: ${crawl.emails.join(', ')}\n` : '') +
      (crawl.palette.length ? `Accent colours used on the site, most frequent first: ${crawl.palette.join(', ')}\n` : '') +
      `${imageList}\n\n${pagesText}`,
  }]

  const [menu, profile] = await Promise.all([
    callGemini<MenuResult>(MENU_PROMPT, MENU_SCHEMA, menuParts, deadline),
    callGemini<ProfileResult>(PROFILE_PROMPT, PROFILE_SCHEMA, profileParts, deadline),
  ])
  const ld = jsonLdBusiness(crawl.jsonLd)
  const b = profile.business || {}

  // Deterministic facts beat the model's reading of them
  const phone = formatPhone(b.phone || ld.phone || crawl.phones[0] || '')
  const email = (crawl.emails[0] || b.email || ld.email || '').trim().toLowerCase()
  const address = (b.address || ld.address || '').trim()

  let hours: Record<string, DayHours> = defaultHours()
  let hoursEstimated = true
  if (profile.hours_found && profile.hours?.length) {
    const parsed: Record<string, DayHours> = {}
    for (const h of profile.hours) {
      const day = DAYS.find(d => d.toLowerCase().startsWith(String(h.day || '').toLowerCase().slice(0, 3)))
      if (!day) continue
      const open = pad(h.open || ''), close = pad(h.close || '')
      parsed[day] = h.closed || !open || !close ? { open: '09:00', close: '17:00', closed: true } : { open, close, closed: false }
    }
    if (Object.keys(parsed).length >= 5) {
      hours = Object.fromEntries(DAYS.map(d => [d, parsed[d] || { open: '09:00', close: '17:00', closed: true }]))
      hoursEstimated = false
    }
  }
  if (hoursEstimated) warnings.push(b.by_appointment_only
    ? 'The site says "by appointment only" — set the days and times clients may book before creating.'
    : 'No opening hours found on the site — placeholder Mon–Sat 10–6 needs confirming.')

  const seenNames = new Set<string>()
  const services: DraftService[] = (menu.services || [])
    .filter(s => s.name && s.name.trim())
    .filter(s => { const k = s.name!.trim().toLowerCase(); if (seenNames.has(k)) return false; seenNames.add(k); return true })
    .map(s => ({
      include: true,
      name: s.name!.trim().slice(0, 120),
      category: (s.category || 'Services').trim().slice(0, 60),
      description: (s.description || '').trim().slice(0, 600),
      price: cleanMoney(s.price),
      price_note: (s.price_note || '').trim().slice(0, 60),
      duration_minutes: Math.min(480, Math.max(5, Math.round((Number(s.duration_minutes) || 60) / 5) * 5)),
      duration_estimated: s.duration_estimated !== false,
      addons: [],
    }))
  if (services.length === 0) warnings.push('No services with prices were found — add them by hand, or check whether the menu is a PDF.')
  if (services.some(s => s.price_note)) warnings.push('Some services are priced per unit/vial, "starting at", or on consultation — the booking page shows the base price and the note goes in the description.')
  if (services.some(s => s.duration_estimated)) warnings.push('Durations marked "est." were estimated — confirm them with the owner.')

  // Match each person to their photo by the model's hint, then by name words
  const staff: DraftStaff[] = (profile.staff || []).filter(s => s.name).map(s => {
    const name = s.name!.trim()
    // Name words minus honorifics and credentials: "Dr. Eleanor F. Lo, M.D." → eleanor
    const words = name.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/)
      .filter(w => w.length > 2 && !/^(dr|mr|mrs|ms|md|rn|np|pa|lmt|the)$/.test(w))
    const hint = (s.photo_hint || '').toLowerCase().replace(/\.(jpe?g|png|webp)$/, '')
    const photo = crawl.images.find(i => {
      const hay = `${decodeURIComponent(i.url)} ${i.alt}`.toLowerCase()
      return !LOGO_HINT.test(hay) && ((hint.length > 3 && hay.includes(hint)) || words.some(w => hay.includes(w)))
    })
    return {
      include: true,
      name: name.slice(0, 80),
      title: (s.title || '').trim().slice(0, 80),
      bio: (s.bio || '').trim().slice(0, 2000),
      photo_url: photo?.url || null,
      role: s.role === 'owner' ? 'owner' : s.role === 'manager' ? 'manager' : 'technician',
      specialties: (s.specialties || []).map(x => String(x).trim()).filter(Boolean).slice(0, 8),
    }
  })
  if (staff.length === 0) warnings.push('No team members found — the owner will be the only staff member.')
  if (staff.filter(s => s.role === 'owner').length > 1) warnings.push('More than one owner listed — pick who gets the login (the claim link); the other owners are added as managers.')

  if (crawl.bookingPlatform) warnings.push(`They currently book through ${crawl.bookingPlatform} — ask the owner to export their client list from it for Clients → Import.`)
  if (!phone) warnings.push('No phone number found.')
  if (!address) warnings.push('No street address found — needed for the timezone and booking page.')
  for (const f of crawl.failed.slice(0, 3)) warnings.push(`Couldn't read ${f.url} (${f.reason}).`)

  const brand = (b.brand_color || '').trim().toLowerCase()
  return {
    source_url: crawl.baseUrl,
    business: {
      name: (b.name || ld.name || new URL(crawl.baseUrl).hostname.replace(/^www\./, '')).trim().slice(0, 120),
      tagline: (b.tagline || '').trim().slice(0, 200),
      about: (b.about || '').trim().slice(0, 2000),
      business_type: b.business_type || 'other',
      phone, email, address,
      website: crawl.baseUrl,
      timezone: timezoneFor(address) || 'America/Los_Angeles',
      logo_url: crawl.logoCandidates[0] || crawl.ogImage || null,
      brand_color: /^#[0-9a-f]{6}$/.test(brand) ? brand : crawl.palette[0] || null,
      palette: crawl.palette,
      by_appointment_only: !!b.by_appointment_only,
      hours_text: (b.hours_text || '').trim().slice(0, 200),
      socials: crawl.socials,
      products: (b.products || []).map(p => String(p).trim()).filter(Boolean).slice(0, 20),
    },
    hours,
    hours_estimated: hoursEstimated,
    services,
    staff,
    faq: (profile.faq || []).filter(f => f.q && f.a).slice(0, 12).map(f => ({ q: f.q.trim().slice(0, 200), a: f.a.trim().slice(0, 500) })),
    // Promotions go stale (a Mother's Day offer in October) — off by default
    promotions: (menu.promotions || []).filter(p => p.title).slice(0, 10).map(p => ({ title: p.title.trim(), details: (p.details || '').trim(), include: false })),
    special_instructions: (profile.special_instructions || '').trim().slice(0, 500),
    booking_platform: crawl.bookingPlatform,
    warnings,
    pages_read: crawl.pages.map(p => p.url),
    menu_images: menuImages,
  }
}
