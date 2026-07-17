/**
 * Format a phone number string as (xxx) xxx-xxxx while the user types.
 * Strips all non-digit characters and caps at 10 digits.
 */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Every spelling of a phone number that might be sitting in clients.phone.
 *
 * We send in E.164 (toE164) and store what formatPhone produced — "(408)
 * 555-1234" for all 162 rows today. Twilio's webhook posts back E.164, so
 * `.eq('phone', from)` compared "+14085551234" against "(408) 555-1234" and
 * never matched a single client: STOP never recorded an opt-out, and every
 * "Reply C to Confirm / X to Cancel" reply answered "we couldn't find your
 * account".
 *
 * Returns the plausible stored formats for the same number so a lookup can use
 * `.in('phone', …)`. Not a substitute for storing one canonical format — that
 * needs a migration and a backfill — but it makes the lookup work against the
 * data as it actually is.
 */
export function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return [phone];

  const a = local.slice(0, 3), b = local.slice(3, 6), c = local.slice(6);
  return [...new Set([
    phone,                    // exactly as given
    `(${a}) ${b}-${c}`,       // what formatPhone writes — the current storage format
    `${a}-${b}-${c}`,
    `${a}.${b}.${c}`,
    `${a} ${b} ${c}`,
    local,                    // 4085551234
    `+1${local}`,             // E.164
    `1${local}`,
  ])];
}

/**
 * Normalize a phone number to E.164 format for Twilio.
 * Strips non-digits, prepends +1 if missing country code.
 * Returns null if the result doesn't look like a valid phone.
 */
export function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * Gregorian-safe locale string.
 * Using "en-US-u-ca-gregory" forces the Gregorian calendar regardless of the
 * user's OS/browser calendar setting (prevents Buddhist Era "BE" dates on
 * Thai-locale devices).
 */
const LOCALE = "en-US-u-ca-gregory";

/**
 * Format a date string as "Mon DD, YYYY" (e.g. "Jun 15, 2013").
 * Always uses the Gregorian calendar — safe for any browser locale.
 */
export function fmtDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"))
    .toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Format a date string with day-of-week: "Mon, Jun 15, 2013".
 * Always uses the Gregorian calendar.
 */
export function fmtDateDay(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"))
    .toLocaleDateString(LOCALE, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/**
 * Gregorian-safe toLocaleDateString wrapper.
 * Pass the same options you'd pass to Date.toLocaleDateString, but the
 * calendar is always forced to Gregorian.
 */
export function localeDateStr(date: Date, opts?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(LOCALE, opts);
}
