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

/**
 * US state abbreviation → IANA timezone mapping.
 * For states spanning multiple timezones (e.g., IN, ND, SD, NE, KS, TX, FL),
 * we use the timezone covering the majority of the population.
 */
const STATE_TZ: Record<string, string> = {
  // Eastern
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', IN: 'America/New_York',
  KY: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/New_York', NH: 'America/New_York',
  NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York',
  OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', VT: 'America/New_York', VA: 'America/New_York',
  WV: 'America/New_York',
  // Central
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago',
  IA: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago',
  MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago',
  NE: 'America/Chicago', ND: 'America/Chicago', OK: 'America/Chicago',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  WI: 'America/Chicago',
  // Mountain
  AZ: 'America/Denver', CO: 'America/Denver', ID: 'America/Denver',
  MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver',
  WY: 'America/Denver',
  // Pacific
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles',
  OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  // Alaska & Hawaii
  AK: 'America/Anchorage',
  HI: 'Pacific/Honolulu',
  // Territories
  PR: 'America/Puerto_Rico', GU: 'Pacific/Guam',
  VI: 'America/Virgin', AS: 'Pacific/Pago_Pago',
}

/**
 * Infer timezone from a US business address string.
 * Looks for a 2-letter state abbreviation in common address formats:
 *   "123 Main St, City, CA 90210"
 *   "123 Main St, City, California 90210"
 *   "City, TX"
 *
 * Returns the IANA timezone or null if no state is detected.
 */
export function timezoneFromAddress(address: string | null | undefined): string | null {
  if (!address) return null

  // Strategy 1: Match "ST ZIPCODE" or "ST, " pattern (most common US address format)
  // Look for 2-letter uppercase state code followed by space+zip or end/comma
  const stateZipMatch = address.match(/\b([A-Z]{2})\s+\d{5}/)
  if (stateZipMatch && STATE_TZ[stateZipMatch[1]]) {
    return STATE_TZ[stateZipMatch[1]]
  }

  // Strategy 2: Match ", ST" at end or before zip
  const commaStateMatch = address.match(/,\s*([A-Z]{2})\s*(?:\d{5}|$)/)
  if (commaStateMatch && STATE_TZ[commaStateMatch[1]]) {
    return STATE_TZ[commaStateMatch[1]]
  }

  // Strategy 3: Match full state names (case-insensitive)
  const fullStateNames: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  }

  const lowerAddr = address.toLowerCase()
  for (const [fullName, abbr] of Object.entries(fullStateNames)) {
    if (lowerAddr.includes(fullName)) {
      return STATE_TZ[abbr] || null
    }
  }

  return null
}

