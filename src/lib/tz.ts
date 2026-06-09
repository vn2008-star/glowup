/**
 * Timezone utilities for GlowUp — zero dependencies, uses built-in Intl API.
 *
 * Core principle: appointments are always stored in UTC (TIMESTAMPTZ).
 * The salon's IANA timezone (e.g., "America/New_York") determines how
 * local times like "10:00 AM" are converted to/from UTC.
 */

/** Default timezone fallback (Pacific) */
export const DEFAULT_TZ = 'America/Los_Angeles'

/**
 * Convert a local date + time string in a specific timezone to a UTC Date.
 *
 * Example: localToUTC('2026-06-10', '10:00', 'America/New_York')
 *   → Date representing 2026-06-10T14:00:00Z (10 AM ET = 2 PM UTC)
 *
 * Uses Intl.DateTimeFormat to detect the UTC offset for the given timezone
 * at the given date/time, then constructs the correct UTC timestamp.
 */
export function localToUTC(dateStr: string, timeStr: string, tz: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)

  // Create a Date in UTC with the same numeric components
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))

  // Use Intl to find what the UTC offset is in the target timezone at this moment
  const offsetMinutes = getUtcOffsetMinutes(naiveUtc, tz)

  // Adjust: if timezone is UTC-5, we need to ADD 5 hours to get UTC
  return new Date(naiveUtc.getTime() + offsetMinutes * 60 * 1000)
}

/**
 * Get the UTC offset in minutes for a timezone at a specific moment.
 * Returns positive values for timezones behind UTC (e.g., +300 for ET = UTC-5).
 */
function getUtcOffsetMinutes(refDate: Date, tz: string): number {
  // Format the refDate in both UTC and the target timezone
  const utcParts = getDateParts(refDate, 'UTC')
  const tzParts = getDateParts(refDate, tz)

  // Build comparable timestamps from the parts
  const utcMs = Date.UTC(utcParts.year, utcParts.month - 1, utcParts.day, utcParts.hour, utcParts.minute)
  const tzMs = Date.UTC(tzParts.year, tzParts.month - 1, tzParts.day, tzParts.hour, tzParts.minute)

  // Offset = UTC time - local time (positive means behind UTC)
  return (utcMs - tzMs) / (60 * 1000)
}

/** Extract date components from a Date in a given timezone */
function getDateParts(date: Date, tz: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const get = (type: string) => {
    const val = parts.find(p => p.type === type)?.value || '0'
    // Handle hour "24" → 0 (midnight edge case in some locales)
    return parseInt(val, 10)
  }

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24, // normalize 24 → 0
    minute: get('minute'),
  }
}

/**
 * Get today's date as "YYYY-MM-DD" in a specific timezone.
 * Critical: a 11 PM Pacific moment is still "today" in PT but "tomorrow" in ET.
 */
export function todayInTz(tz: string): string {
  return formatDateInTz(new Date(), tz)
}

/**
 * Format a Date object as "YYYY-MM-DD" in a specific timezone.
 */
export function formatDateInTz(date: Date, tz: string): string {
  const parts = getDateParts(date, tz)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

/**
 * Format an ISO timestamp string for display in a specific timezone.
 * Wraps Intl.DateTimeFormat with the timezone option.
 *
 * Example: formatInTz('2026-06-10T14:00:00Z', 'America/New_York', { hour: 'numeric', minute: '2-digit' })
 *   → "10:00 AM"
 */
export function formatInTz(isoString: string, tz: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: tz }).format(date)
}

/**
 * Get the current time in a specific timezone as { hour, minute } (24h format).
 * Useful for filtering out past time slots.
 */
export function nowInTz(tz: string): { hour: number; minute: number; dateStr: string } {
  const now = new Date()
  const parts = getDateParts(now, tz)
  return {
    hour: parts.hour,
    minute: parts.minute,
    dateStr: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
  }
}

/**
 * US timezone options for the settings dropdown.
 */
export const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
] as const
