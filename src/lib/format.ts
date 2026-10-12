// ─── Money, time and date formatting ───
// One place for the formats that used to be hand-rolled in 30 files:
// `$${price}` printed "$45.5", nine screens pinned "en-US" while the UI was in
// Vietnamese, and AM/PM was assembled by hand in two places.

import { DEFAULT_TZ } from '@/lib/tz'

const moneyCache = new Map<string, Intl.NumberFormat>()

/** "$45.50". Rounds to cents; never prints "$45.5" or "$NaN". */
export function formatMoney(amount: number | string | null | undefined, opts?: { locale?: string; currency?: string; cents?: boolean }): string {
  const n = Number(amount)
  const safe = Number.isFinite(n) ? n : 0
  const locale = opts?.locale || 'en-US'
  const currency = opts?.currency || 'USD'
  const cents = opts?.cents ?? true
  const key = `${locale}|${currency}|${cents}`
  let f = moneyCache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
    moneyCache.set(key, f)
  }
  return f.format(safe)
}

/** "10:30 AM" in the salon's zone. */
export function formatTime(iso: string | Date | null | undefined, tz: string = DEFAULT_TZ, locale = 'en-US'): string {
  if (!iso) return ''
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(d)
}

/** "Fri, Oct 9" (default) or any Intl date options, in the salon's zone. */
export function formatDate(
  iso: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' },
  locale = 'en-US'
): string {
  if (!iso) return ''
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: tz }).format(d)
}

/** A "YYYY-MM-DD" (no zone) as "Oct 9, 2026". */
export function formatDateOnly(dateStr: string | null | undefined, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }, locale = 'en-US'): string {
  if (!dateStr) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return ''
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
}
