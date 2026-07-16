// ─── Cron endpoint authentication ───
// These GET routes are publicly routable and each one fans out real Twilio /
// Resend sends across every tenant, so they must never be callable by a
// stranger.
//
// Vercel Cron authenticates by sending `Authorization: Bearer $CRON_SECRET`
// when a CRON_SECRET environment variable exists on the project. The previous
// guard was `if (cronSecret && authHeader !== ...)`, which skipped the check
// entirely whenever CRON_SECRET was unset — and it was unset in production, so
// the endpoints were wide open. This fails closed instead: no secret
// configured means nobody gets in, including us.

/**
 * Returns null when the request is an authorised cron invocation, or a Response
 * to return immediately when it is not.
 *
 * Deliberately does not distinguish "no secret configured" from "wrong secret"
 * in the response body — a caller shouldn't learn which it is.
 */
export function verifyCronRequest(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error(
      '[cron-auth] CRON_SECRET is not set — refusing the request. ' +
      'Set it on the Vercel project (Production + Preview) and redeploy; ' +
      'Vercel then sends it as a Bearer token on every cron invocation.'
    )
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
