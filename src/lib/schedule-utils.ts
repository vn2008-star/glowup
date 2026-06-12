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

/* ─── Shared Holiday Definitions ─── */
export interface ClosedDayHoliday {
  name: string
  emoji: string
  month: number  // 0-indexed
  day: number
}

/** Common US holidays — shared across Settings, Staff, and Booking pages. */
export const CLOSED_DAY_HOLIDAYS: ClosedDayHoliday[] = [
  { name: "New Year's Day", emoji: '🎆', month: 0, day: 1 },
  { name: "MLK Day", emoji: '✊', month: 0, day: 20 },
  { name: "Presidents' Day", emoji: '🇺🇸', month: 1, day: 17 },
  { name: "Memorial Day", emoji: '🇺🇸', month: 4, day: 26 },
  { name: "4th of July", emoji: '🎆', month: 6, day: 4 },
  { name: "Labor Day", emoji: '💪', month: 8, day: 1 },
  { name: "Thanksgiving", emoji: '🦃', month: 10, day: 27 },
  { name: "Christmas Eve", emoji: '🎄', month: 11, day: 24 },
  { name: "Christmas", emoji: '🎄', month: 11, day: 25 },
  { name: "New Year's Eve", emoji: '🎉', month: 11, day: 31 },
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

  // Check holiday closures by month/day
  const d = new Date(dateStr + 'T00:00:00')
  const month = d.getMonth()
  const day = d.getDate()

  for (const holidayName of closedHolidays) {
    const holiday = CLOSED_DAY_HOLIDAYS.find(h => h.name === holidayName)
    if (holiday && holiday.month === month && holiday.day === day) return true
  }

  return false
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
  if (holidaysOff.length > 0) {
    const d = new Date(dateStr + 'T00:00:00')
    const month = d.getMonth()
    const day = d.getDate()
    for (const holidayName of holidaysOff) {
      const holiday = CLOSED_DAY_HOLIDAYS.find(h => h.name === holidayName)
      if (holiday && holiday.month === month && holiday.day === day) return true
    }
  }

  // Check vacations
  const vacations = (schedule.vacations || []) as { start: string; end: string }[]
  if (vacations.some(v => dateStr >= v.start && dateStr <= v.end)) return true

  const d2 = new Date(dateStr + 'T00:00:00')
  const dayName = d2.toLocaleDateString('en-US', { weekday: 'long' })

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
