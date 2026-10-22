// ─── Claiming an imported business ───
// A tenant built by the website importer has an owner staff row with no login
// (user_id null). The admin sends the owner a claim link; signing up through
// it binds the new account to that row instead of creating a fresh salon.
//
// The token is an HMAC over (tenant, staff, nonce) with the service key. The
// nonce lives in settings.import.claim_nonce, so the admin can revoke a link
// by rotating it, and a claimed row (user_id set) can never be claimed twice.
//
// The same path also takes STAFF invites: an owner/manager hands a teammate
// whose row has no login a link from the Staff page. That token is
// tenant.staff.expiry.sig — no nonce to store; it dies when it expires, when
// the row gets a login (single use), or when the row is deleted.

import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ImportMeta = {
  source_url?: string
  imported_at?: string
  imported_by?: string
  /** Booking page shows a preview banner and refuses bookings while true */
  preview?: boolean
  claim_nonce?: string
  owner_staff_id?: string
  owner_email?: string
  claimed_at?: string
  claimed_by?: string
  [key: string]: unknown
}

export function readImportMeta(settings: unknown): ImportMeta | null {
  const raw = (settings && typeof settings === 'object' ? (settings as Record<string, unknown>).import : null)
  return raw && typeof raw === 'object' ? raw as ImportMeta : null
}

export function newClaimNonce(): string {
  return crypto.randomBytes(9).toString('base64url')
}

function sign(tenantId: string, staffId: string, nonce: string): string {
  return crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '').update(`claim:${tenantId}:${staffId}:${nonce}`).digest('hex').slice(0, 32)
}

export function claimToken(tenantId: string, staffId: string, nonce: string): string {
  return `${tenantId}.${staffId}.${sign(tenantId, staffId, nonce)}`
}

const STAFF_INVITE_DAYS = 14

function signStaffInvite(tenantId: string, staffId: string, expires: number): string {
  return crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '').update(`staff-invite:${tenantId}:${staffId}:${expires}`).digest('hex').slice(0, 32)
}

/** Token for a teammate's login invite (Staff page). Expires in 14 days. */
export function staffInviteToken(tenantId: string, staffId: string): { token: string; expires: Date } {
  const expires = Math.floor(Date.now() / 1000) + STAFF_INVITE_DAYS * 24 * 60 * 60
  return { token: `${tenantId}.${staffId}.${expires}.${signStaffInvite(tenantId, staffId, expires)}`, expires: new Date(expires * 1000) }
}

function sigMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected), b = Buffer.from(given)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

type Claimable = {
  /** owner = imported salon's owner claim; staff = teammate invite */
  kind: 'owner' | 'staff'
  tenant: { id: string; name: string; logo_url: string | null; settings: Record<string, unknown> }
  staff: { id: string; name: string; email: string | null; role: string }
  meta: ImportMeta
}

/** The tenant and staff row a token opens, or null if it's forged, revoked, expired or already used. */
export async function resolveClaim(svc: SupabaseClient, token: string): Promise<Claimable | null> {
  const parts = String(token || '').split('.')
  const [tenantId, staffId] = parts
  if (!/^[0-9a-f-]{36}$/i.test(tenantId || '') || !/^[0-9a-f-]{36}$/i.test(staffId || '')) return null
  if (parts.length === 4) return resolveStaffInvite(svc, tenantId, staffId, parts[2], parts[3])
  const sig = parts[2]
  if (parts.length !== 3 || !sig) return null

  const { data: tenant } = await svc.from('tenants').select('id, name, logo_url, settings').eq('id', tenantId).maybeSingle()
  const meta = readImportMeta(tenant?.settings)
  if (!tenant || !meta?.claim_nonce || meta.claimed_at) return null

  if (!sigMatches(sign(tenantId, staffId, meta.claim_nonce), sig)) return null

  const { data: staff } = await svc.from('staff').select('id, name, email, user_id, role').eq('id', staffId).eq('tenant_id', tenantId).maybeSingle()
  if (!staff || staff.user_id || staff.role !== 'owner') return null

  return { kind: 'owner', tenant: { ...tenant, settings: (tenant.settings || {}) as Record<string, unknown> }, staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role }, meta }
}

async function resolveStaffInvite(svc: SupabaseClient, tenantId: string, staffId: string, expiresRaw: string, sig: string): Promise<Claimable | null> {
  const expires = Number(expiresRaw)
  if (!Number.isInteger(expires) || expires * 1000 < Date.now() || !sig) return null
  if (!sigMatches(signStaffInvite(tenantId, staffId, expires), sig)) return null

  const [{ data: tenant }, { data: staff }] = await Promise.all([
    svc.from('tenants').select('id, name, logo_url, settings').eq('id', tenantId).is('deleted_at', null).maybeSingle(),
    svc.from('staff').select('id, name, email, user_id, role').eq('id', staffId).eq('tenant_id', tenantId).maybeSingle(),
  ])
  // An owner row is only ever handed over by the import claim above
  if (!tenant || !staff || staff.user_id || staff.role === 'owner') return null

  return { kind: 'staff', tenant: { ...tenant, settings: (tenant.settings || {}) as Record<string, unknown> }, staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role }, meta: {} }
}

/**
 * Bind a freshly signed-up account to an imported salon's owner row, or to a
 * teammate's row from a staff invite.
 * Returns the tenant id, or null when the token doesn't (or no longer) open anything.
 */
export async function claimTenant(svc: SupabaseClient, token: string, userId: string, email: string): Promise<string | null> {
  const claim = await resolveClaim(svc, token)
  if (!claim) return null

  // Conditional on user_id still being null: two tabs racing the same link
  // can't both win.
  const { data: bound } = await svc
    .from('staff')
    // A teammate's email on file is where the salon sends their schedule —
    // only fill it when blank rather than swap it for the login address
    .update({ user_id: userId, email: claim.kind === 'staff' ? (claim.staff.email || email) : email })
    .eq('id', claim.staff.id)
    .is('user_id', null)
    .select('id')
    .maybeSingle()
  if (!bound) return null
  if (claim.kind === 'staff') return claim.tenant.id

  const now = new Date()
  const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const { claim_nonce: _spent, ...meta } = claim.meta
  void _spent
  await svc.from('tenants').update({
    // The trial starts when the owner arrives, not when we built the salon
    trial_ends_at: trialEnd.toISOString(),
    settings: { ...claim.tenant.settings, import: { ...meta, claimed_at: now.toISOString(), claimed_by: email } },
  }).eq('id', claim.tenant.id)

  return claim.tenant.id
}
