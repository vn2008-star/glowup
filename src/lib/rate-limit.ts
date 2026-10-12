// ─── Per-instance rate limiting for the public (unauthenticated) routes ───
//
// Public booking, the walk-in waitlist and the AI chat each create rows,
// send the owner a text, or call Gemini on every request, with nothing to
// stop a loop of requests. This is a fixed-window counter in memory: it
// resets when the serverless instance is recycled and is not shared between
// instances, so it stops a script hammering one endpoint rather than a
// distributed attack. Good enough for the cost it protects; a KV-backed
// limiter is the upgrade if that ever stops being true.

const buckets = new Map<string, { count: number; resetAt: number }>()

/** Best-effort client address from the proxy headers. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

/**
 * True when `key` has exceeded `limit` hits inside the current window.
 * Callers answer 429 and stop. Old buckets are pruned opportunistically so
 * the map can't grow without bound on a long-lived instance.
 */
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  }
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  b.count += 1
  return b.count > limit
}

export const TOO_MANY = { error: 'Too many requests. Please wait a few minutes and try again.' }
