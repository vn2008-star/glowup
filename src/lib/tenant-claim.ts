// ─── Claiming an imported business ───
// A tenant built by the website importer has an owner staff row with no login
// (user_id null). The admin sends the owner a claim link; signing up through
// it binds the new account to that row instead of creating a fresh salon.
//
// The token is an HMAC over (tenant, staff, nonce) with the service key. The
// nonce lives in settings.import.claim_nonce, so the admin can revoke a link
// by rotating it, and a claimed row (user_id set) can never be claimed twice.

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

type Claimable = {
  tenant: { id: string; name: string; logo_url: string | null; settings: Record<string, unknown> }
  staff: { id: string; name: string }
  meta: ImportMeta
}

/** The tenant and owner row a token opens, or null if it's forged, revoked or already used. */
export async function resolveClaim(svc: SupabaseClient, token: string): Promise<Claimable | null> {
  const [tenantId, staffId, sig] = String(token || '').split('.')
  if (!/^[0-9a-f-]{36}$/i.test(tenantId || '') || !/^[0-9a-f-]{36}$/i.test(staffId || '') || !sig) return null

  const { data: tenant } = await svc.from('tenants').select('id, name, logo_url, settings').eq('id', tenantId).maybeSingle()
  const meta = readImportMeta(tenant?.settings)
  if (!tenant || !meta?.claim_nonce || meta.claimed_at) return null

  const expected = Buffer.from(sign(tenantId, staffId, meta.claim_nonce)), given = Buffer.from(sig)
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null

  const { data: staff } = await svc.from('staff').select('id, name, user_id, role').eq('id', staffId).eq('tenant_id', tenantId).maybeSingle()
  if (!staff || staff.user_id || staff.role !== 'owner') return null

  return { tenant: { ...tenant, settings: (tenant.settings || {}) as Record<string, unknown> }, staff: { id: staff.id, name: staff.name }, meta }
}

/**
 * Bind a freshly signed-up account to an imported salon's owner row.
 * Returns the tenant id, or null when the token doesn't (or no longer) open anything.
 */
export async function claimTenant(svc: SupabaseClient, token: string, userId: string, email: string): Promise<string | null> {
  const claim = await resolveClaim(svc, token)
  if (!claim) return null

  // Conditional on user_id still being null: two tabs racing the same link
  // can't both win.
  const { data: bound } = await svc
    .from('staff')
    .update({ user_id: userId, email })
    .eq('id', claim.staff.id)
    .is('user_id', null)
    .select('id')
    .maybeSingle()
  if (!bound) return null

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
