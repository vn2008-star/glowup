// A tiny stale-while-revalidate cache in front of /api/data.
//
// Why this exists: every dashboard page is a client component that mounts with
// empty state, fires its own fetch, and renders "Loading services…" in the
// meantime. Clicking Services, then Holidays, then back to Services showed that
// message three times for data that had not changed. The navigation itself is
// instant — the loading message was the whole of the perceived slowness.
//
// So a page seeds its state from `cached()` synchronously during the first
// render (no flash: React never paints a loading state at all) and still
// re-fetches through `cachedQuery()` in its effect, which writes the fresh
// result back. Stale data is on screen for the ~200ms the round-trip takes,
// then it corrects itself. This is the same pattern the tenant context has used
// since it was written; this generalises it to the rest of the data layer.
//
// The cache is module state: per tab, cleared on a full reload, and gone the
// moment the bundle is re-parsed. It never touches storage — nothing here
// should outlive the session, least of all across a sign-out.

type Entry = { data: unknown; ts: number };

const cache = new Map<string, Entry>();

// How stale a first paint is allowed to be. Beyond this the page shows its
// loading state again rather than flashing something from an hour ago — a tab
// left open over lunch should not open on yesterday's numbers, even briefly.
const STALE_PAINT_TTL = 10 * 60 * 1000;

/**
 * Actions that only read. Everything else is treated as a write, so a new
 * action added to /api/data invalidates too eagerly rather than not at all —
 * the failure mode is a wasted fetch, not stale data on screen.
 */
const READ_ACTIONS = new Set([
  'appointments.list',
  'calendar.load',
  'campaigns.list',
  'charges.list',
  'clients.birthdays',
  'clients.history',
  'clients.list',
  'clients.search',
  'conversations.list',
  'credits.lookup',
  'dashboard.overview',
  'feedback.list',
  'gallery.list',
  'giftcards.list',
  'giftcards.lookup',
  'loyalty.overview',
  'messages.list',
  'packages.list',
  'reports.cancellations',
  'reports.daily-tally',
  'reports.forecast',
  'reports.overview',
  'reports.peak-hours',
  'reports.retention',
  'reports.staff-performance',
  'reports.staff-revenue',
  'sms.gateway-status',
  'service_history.list',
  'services.list',
  'social.list',
  'staff.list',
  'waitlist.list',
]);

/**
 * Namespaces that summarise other tables. A write anywhere can move a number on
 * these, so they are dropped on every write rather than reasoned about one
 * table at a time.
 */
const DERIVED_NAMESPACES = ['dashboard', 'reports', 'loyalty', 'calendar'];

function keyOf(action: string, payload?: Record<string, unknown>): string {
  if (!payload || Object.keys(payload).length === 0) return action;
  return `${action}|${JSON.stringify(payload)}`;
}

export function isReadAction(action: string): boolean {
  return READ_ACTIONS.has(action);
}

/**
 * The cached result of a previous read, or undefined if there isn't one worth
 * painting. Call it from a useState initialiser so the value is on screen in
 * the first render rather than one paint later.
 */
export function cached<T>(action: string, payload?: Record<string, unknown>): T | undefined {
  const key = keyOf(action, payload);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > STALE_PAINT_TTL) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

/** True when `cached()` would return something — including a cached `null`. */
export function hasCached(action: string, payload?: Record<string, unknown>): boolean {
  return cached(action, payload) !== undefined;
}

export function writeCache(action: string, payload: Record<string, unknown> | undefined, data: unknown) {
  if (data === undefined) return;
  cache.set(keyOf(action, payload), { data, ts: Date.now() });
}

/** Drop every entry in the given namespaces ("services", "clients", …). */
export function invalidateNamespaces(...namespaces: string[]) {
  for (const key of cache.keys()) {
    const ns = key.split('.')[0];
    if (namespaces.includes(ns)) cache.delete(key);
  }
}

/**
 * Called after a successful write. Drops the table that was written plus the
 * summaries built on top of it, so the next page to open re-reads rather than
 * painting a number the write just changed.
 */
export function invalidateForWrite(action: string) {
  invalidateNamespaces(action.split('.')[0], ...DERIVED_NAMESPACES);
}

/**
 * Everything, unconditionally. Belongs on sign-out and on entering or leaving
 * impersonation — one salon's clients must never paint inside another's.
 */
export function clearDataCache() {
  cache.clear();
}
