// ─── Public Base URL ───

/**
 * The base URL for any link we send to a client (booking page, manage page,
 * statements).
 *
 * NEVER use `VERCEL_URL` for this. That is the *deployment-specific* hostname
 * (e.g. `glowup-ll18cv602-vn2008-stars-projects.vercel.app`): it changes on
 * every deploy, so links in already-sent emails rot, and it sits behind Vercel
 * Authentication — a client tapping it gets a login wall instead of the booking
 * page. It also looks like spam next to the salon's name.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is the stable production hostname and is the
 * correct fallback when NEXT_PUBLIC_SITE_URL isn't set.
 */
export function siteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
    || 'https://glowup-jade.vercel.app'
}
