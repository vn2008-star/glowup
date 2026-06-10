/**
 * Schedule utilities — shared logic for per-day alternating schedules.
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

/** Return the ISO-8601 week number for a given date string (YYYY-MM-DD). */
export function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  // Move to nearest Thursday (ISO weeks start Monday, week 1 contains Jan 4)
  const target = new Date(d.getTime())
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const jan4 = new Date(target.getFullYear(), 0, 4)
  return 1 + Math.round(((target.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
}

interface DaySchedule {
  off?: boolean
  alternating?: boolean
  alternatingPhase?: 'even' | 'odd'
}

/**
 * Check whether a staff member is off on a specific date.
 *
 * Supports per-day alternating schedules: if `alternating` is set on a day,
 * the staff works every other week based on ISO week parity.
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
  const d = new Date(dateStr + 'T00:00:00')
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long' })

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
