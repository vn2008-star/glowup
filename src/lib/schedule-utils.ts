/**
 * Schedule utilities — shared logic for per-day alternating schedules,
 * business-wide closed days, and per-staff holiday preferences.
 *
 * Each day in a staff schedule can independently be:
 *   - Working every week  (off: false, alternating: undefined/false)
 *   - Off every week       (off: true,  alternating: undefined/false)
 *   - Every other week     (off: false, alternating: true)
 *
 * When `alternating` is true, the staff works on weeks whose ISO week
 * number parity matches `alternatingPhase` (default "even").
 *   - "even" → works on even ISO weeks, off on odd
 *   - "odd"  → works on odd  ISO weeks, off on even
 */

import { localeDateStr } from '@/lib/utils'

/* ─── Shared Holiday Definitions ─── */
interface HolidayBase {
  name: string   // stable key — this is what's persisted in closed_holidays / holidays_off
  emoji: string
}

/** Falls on the same calendar date every year (e.g. 4th of July). */
export interface FixedHoliday extends HolidayBase {
  month: number  // 0-indexed
  day: number
}

/**
 * Falls on the nth weekday of the month, so the date moves every year
 * (e.g. Labor Day = 1st Monday of September).
 */
export interface FloatingHoliday extends HolidayBase {
  month: number     // 0-indexed
  weekday: number   // 0 = Sunday … 6 = Saturday
  nth: number       // 1 = first, 2 = second, … ; -1 = last, -2 = second to last
  offsetDays?: number  // days added after resolving (Black Friday = Thanksgiving + 1)
}

/**
 * Follows no Gregorian rule at all (Lunar New Year) — dates come from a table.
 * Years outside the table resolve to null; extend `dates` before it runs out.
 */
export interface LookupHoliday extends HolidayBase {
  dates: Record<number, string>  // year → 'MM-DD'
}

export type ClosedDayHoliday = FixedHoliday | FloatingHoliday | LookupHoliday

/** Common US holidays — shared across Settings, Staff, Calendar, and Booking pages. */
export const CLOSED_DAY_HOLIDAYS: ClosedDayHoliday[] = [
  { name: "New Year's Day", emoji: '🎆', month: 0, day: 1 },
  { name: "MLK Day", emoji: '✊', month: 0, weekday: 1, nth: 3 },
  { name: "Presidents' Day", emoji: '🇺🇸', month: 1, weekday: 1, nth: 3 },
  { name: "Memorial Day", emoji: '🇺🇸', month: 4, weekday: 1, nth: -1 },
  { name: "4th of July", emoji: '🎆', month: 6, day: 4 },
  { name: "Labor Day", emoji: '💪', month: 8, weekday: 1, nth: 1 },
  { name: "Thanksgiving", emoji: '🦃', month: 10, weekday: 4, nth: 4 },
  { name: "Christmas Eve", emoji: '🎄', month: 11, day: 24 },
  { name: "Christmas", emoji: '🎄', month: 11, day: 25 },
  { name: "New Year's Eve", emoji: '🎉', month: 11, day: 31 },
]

/**
 * The Date this holiday falls on in a given year.
 * Returns null only for a lookup holiday in a year the table doesn't cover.
 */
export function getHolidayDate(holiday: ClosedDayHoliday, year: number): Date | null {
  if ('dates' in holiday) {
    const md = holiday.dates[year]
    if (!md) return null
    const [month, day] = md.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  if ('day' in holiday) return new Date(year, holiday.month, holiday.day)

  const { month, weekday, nth } = holiday
  let day: number

  if (nth > 0) {
    // Offset from the 1st of the month to the first matching weekday.
    const firstWeekday = new Date(year, month, 1).getDay()
    day = 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7
  } else {
    // Count backwards from the last day of the month.
    const lastDate = new Date(year, month + 1, 0)
    day = lastDate.getDate() - ((lastDate.getDay() - weekday + 7) % 7) - (-nth - 1) * 7
  }

  const d = new Date(year, month, day)
  if (holiday.offsetDays) d.setDate(d.getDate() + holiday.offsetDays)  // may roll into the next month
  return d
}

/**
 * The next occurrence of a holiday on or after `from` — used for UI labels and
 * promo scheduling so a holiday never displays or fires on a stale date.
 */
export function getNextHolidayDate(holiday: ClosedDayHoliday, from: Date = new Date()): Date | null {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const thisYear = getHolidayDate(holiday, today.getFullYear())
  if (thisYear && thisYear >= today) return thisYear
  return getHolidayDate(holiday, today.getFullYear() + 1)
}

/** True if `holiday` falls on `dateStr` (YYYY-MM-DD), resolved for that date's own year. */
export function holidayFallsOn(holiday: ClosedDayHoliday, dateStr: string): boolean {
  const target = new Date(dateStr + 'T00:00:00')
  const resolved = getHolidayDate(holiday, target.getFullYear())
  return !!resolved && resolved.getTime() === target.getTime()
}

/**
 * Find which of the named holidays (if any) falls on `dateStr` (YYYY-MM-DD).
 * Floating holidays are resolved against that date's own year.
 */
export function findHolidayOnDate(
  holidayNames: string[],
  dateStr: string,
): ClosedDayHoliday | undefined {
  if (holidayNames.length === 0) return undefined

  for (const name of holidayNames) {
    const holiday = CLOSED_DAY_HOLIDAYS.find(h => h.name === name)
    if (holiday && holidayFallsOn(holiday, dateStr)) return holiday
  }

  return undefined
}

/**
 * Default birthday-promo copy. Owners can override it in Settings; this is what
 * they see until they do. Defined once — the automation cron, the manual
 * "send birthday promo" action, and the Loyalty settings screen all read it.
 */
export const DEFAULT_BIRTHDAY_TEMPLATE = [
  `Happy Birthday, {name}! 🎂`,
  ``,
  `{business_name} wants to celebrate YOU — enjoy {discount}% off any service this month.`,
  ``,
  `Book now → {booking_url}`,
].join('\n')

/* ─── Promo Holiday Calendar ─── */
/**
 * Marketing holidays — a different set from CLOSED_DAY_HOLIDAYS (these are days
 * you sell into, not days you close). Shared by the campaigns page and the
 * holiday auto-send in /api/run-automations so the two can't drift apart.
 */
export type PromoHoliday = ClosedDayHoliday & {
  template: string    // {name} / {booking_url} / {business_name} tokens
  promoIdea: string   // shown in the campaigns UI as inspiration
}

export const PROMO_HOLIDAYS: PromoHoliday[] = [
  // Lunar New Year is lunisolar — no Gregorian rule fits, so the dates are tabulated.
  { name: "Lunar New Year", emoji: "🧧", dates: {
      2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03',
      2031: '01-23', 2032: '02-11', 2033: '01-31', 2034: '02-19', 2035: '02-08',
    },
    template: "🧧 Lunar New Year Special!\n\nRing in the new year looking radiant — 20% off all services, plus lucky red gift cards 🎊\n\nBook now → {booking_url}",
    promoIdea: "Lucky red gift cards, new year glow-up packages, family bundles, festive nail art" },
  { name: "Valentine's Day", emoji: "💖", month: 1, day: 14,
    template: "💖 Valentine's Day Special!\n\nLook & feel amazing for your date — 15% off any service this week.\n\nBook now → {booking_url}",
    promoIdea: "Couples packages, date-night glam, gift cards, pampering bundles" },
  { name: "International Women's Day", emoji: "💜", month: 2, day: 8,
    template: "💜 Happy Women's Day, {name}!\n\nCelebrate YOU with a self-care session — 20% off this week only.\n\nBook now → {booking_url}",
    promoIdea: "Self-care packages, group bookings, squad deals, wellness bundles" },
  { name: "Mother's Day", emoji: "🌹", month: 4, weekday: 0, nth: 2,
    template: "🌹 Mother's Day Special!\n\nGive Mom the gift of pampering — gift cards plus 15% off spa & beauty packages.\n\nBook now → {booking_url}",
    promoIdea: "Gift cards, mother-daughter packages, spa bundles, relaxation treats" },
  { name: "Memorial Day", emoji: "🇺🇸", month: 4, weekday: 1, nth: -1,
    template: "🇺🇸 Memorial Day Sale!\n\nGet summer-ready — 20% off all services this weekend.\n\nBook now → {booking_url}",
    promoIdea: "Summer-ready specials, weekend flash sales, seasonal treatments" },
  { name: "4th of July", emoji: "🎆", month: 6, day: 4,
    template: "🎆 4th of July Glow-Up!\n\nGet party-ready with our holiday special.\n\nBook now → {booking_url}",
    promoIdea: "Festive styling, summer glow packages, group party prep" },
  { name: "Back to School", emoji: "🎒", month: 7, day: 15,
    template: "🎒 Back to School Special!\n\nStart the year fresh with a new look — student discount: 15% off.\n\nBook now → {booking_url}",
    promoIdea: "Student discounts, fresh-start packages, new-look specials" },
  { name: "Halloween", emoji: "🎃", month: 9, day: 31,
    template: "🎃 Halloween Glam!\n\nGet costume-ready with our spooky season specials.\n\nBook now → {booking_url}",
    promoIdea: "Themed styling, costume-ready looks, group rates, special effects" },
  { name: "Thanksgiving", emoji: "🦃", month: 10, weekday: 4, nth: 4,
    template: "🦃 Look stunning for Thanksgiving!\n\nBook your holiday session — family discounts available.\n\nBook now → {booking_url}",
    promoIdea: "Family packages, pre-holiday styling, gift cards, group bookings" },
  { name: "Black Friday", emoji: "💰", month: 10, weekday: 4, nth: 4, offsetDays: 1,
    template: "💰 Black Friday DEAL!\n\nOur biggest sale of the year — up to 30% off services, plus bonus gift cards.\n\nBook now → {booking_url}",
    promoIdea: "Flash sales, bundle deals, buy-one-get-one gift cards, VIP packages" },
  { name: "Christmas", emoji: "🎄", month: 11, day: 25,
    template: "🎄 Holiday Glow!\n\nGet party-ready for the season — gift cards make the perfect present 🎁\n\nBook now → {booking_url}",
    promoIdea: "Gift cards, holiday party prep, pampering packages, wellness gifts" },
  { name: "New Year's Eve", emoji: "🎉", month: 11, day: 31,
    template: "🎉 New Year's Glow-Up!\n\nRing in the new year looking & feeling amazing — limited spots available.\n\nBook now → {booking_url}",
    promoIdea: "NYE glam packages, last-minute appointments, fresh-start specials" },
]

export interface CustomClosedDate {
  date: string   // YYYY-MM-DD
  label: string
}

/** Return the ISO-8601 week number for a given date string (YYYY-MM-DD). */
export function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  // Move to nearest Thursday (ISO weeks start Monday, week 1 contains Jan 4)
  const target = new Date(d.getTime())
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const jan4 = new Date(target.getFullYear(), 0, 4)
  return 1 + Math.round(((target.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
}

/**
 * Check whether the business is closed on a specific date due to
 * business-wide holiday closures or custom closed dates.
 */
export function isBusinessClosedOnDate(
  closedHolidays: string[],
  customClosedDates: CustomClosedDate[],
  dateStr: string,
): boolean {
  // Check custom closed dates (exact match)
  if (customClosedDates.some(c => c.date === dateStr)) return true

  // Check holiday closures (floating holidays resolved for this date's year)
  return !!findHolidayOnDate(closedHolidays, dateStr)
}

interface DaySchedule {
  off?: boolean
  alternating?: boolean
  alternatingPhase?: 'even' | 'odd'
}

/**
 * Check whether a staff member is off on a specific date.
 *
 * Supports:
 *   - Per-day alternating schedules (every other week)
 *   - Per-staff holiday preferences (holidays_off[])
 *   - Vacation date ranges
 *
 * @param schedule  The full schedule object stored on the staff record.
 * @param dateStr   YYYY-MM-DD string of the date to check.
 * @returns `true` if the staff member is off on this date.
 */
export function isStaffOffOnDate(
  schedule: Record<string, unknown> | undefined | null,
  dateStr: string,
): boolean {
  if (!schedule) return false

  // Check per-staff holidays_off
  const holidaysOff = (schedule.holidays_off || []) as string[]
  if (findHolidayOnDate(holidaysOff, dateStr)) return true

  // Check vacations
  const vacations = (schedule.vacations || []) as { start: string; end: string }[]
  if (vacations.some(v => dateStr >= v.start && dateStr <= v.end)) return true

  const d2 = new Date(dateStr + 'T00:00:00')
  const dayName = localeDateStr(d2, { weekday: 'long' })

  const daySched = schedule[dayName] as DaySchedule | undefined
  if (!daySched) return false

  // Per-day alternating: staff works every other week on this day
  if (daySched.alternating && !daySched.off) {
    const weekNum = getISOWeekNumber(dateStr)
    const phase = daySched.alternatingPhase || 'even'
    const isEvenWeek = weekNum % 2 === 0
    // Work on matching weeks, off on non-matching
    if (phase === 'even') return !isEvenWeek   // off on odd weeks
    return isEvenWeek                           // off on even weeks
  }

  return !!daySched.off
}
