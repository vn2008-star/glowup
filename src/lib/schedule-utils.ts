/**
 * Schedule utilities — shared logic for alternating weekends and day-off checks.
 *
 * "Alternating weekends" means a staff member works Saturday one week and
 * Sunday the next (or vice-versa). The pattern is driven by ISO week number:
 *   - Even ISO weeks → works the `firstWeekendDay` (default "Saturday")
 *   - Odd  ISO weeks → works the other weekend day
 */

/** Return the ISO-8601 week number for a given date. */
export function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  // Move to nearest Thursday (ISO weeks start Monday, week 1 contains Jan 4)
  const target = new Date(d.getTime())
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const jan4 = new Date(target.getFullYear(), 0, 4)
  return 1 + Math.round(((target.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
}

/**
 * Check whether a staff member is off on a specific date, taking into account
 * the alternating-weekends schedule setting.
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

  const daySched = schedule[dayName] as { off?: boolean } | undefined

  // If alternating weekends is enabled and this is a weekend day, override the
  // static `off` flag based on the ISO week number.
  const altWeekends = schedule.alternatingWeekends as boolean | undefined
  if (altWeekends && (dayName === 'Saturday' || dayName === 'Sunday')) {
    // firstWeekendDay is the day worked on even weeks (default Saturday)
    const firstDay = (schedule.firstWeekendDay as string) || 'Saturday'
    const secondDay = firstDay === 'Saturday' ? 'Sunday' : 'Saturday'
    const weekNum = getISOWeekNumber(dateStr)
    const isEvenWeek = weekNum % 2 === 0

    // On even weeks: firstDay is working, secondDay is off
    // On odd weeks:  secondDay is working, firstDay is off
    if (dayName === firstDay) return !isEvenWeek  // off on odd weeks
    if (dayName === secondDay) return isEvenWeek   // off on even weeks
  }

  return !!daySched?.off
}
