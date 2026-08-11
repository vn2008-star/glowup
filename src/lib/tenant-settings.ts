// Tenant settings carry a secret: sms_gateway holds the login/password for the
// salon's own phone-based SMS gateway. The dashboard ships the whole tenant row
// to the browser (staff of every role), so the credentials are stripped on the
// way out and replaced with a status the Settings UI can render.

export type PublicSmsGateway = {
  configured: boolean
  enabled: boolean
  phone?: string
  base_url?: string
  /** Present so Settings can show the inbound webhook URL without the key. */
  has_webhook_key: boolean
}

/**
 * Copy of a tenant row with secrets removed. Call this on every path that
 * returns a tenant to a client.
 */
export function redactTenantSettings<T extends Record<string, unknown> | null | undefined>(
  tenant: T
): T {
  if (!tenant || typeof tenant !== 'object') return tenant
  const settings = (tenant as Record<string, unknown>).settings
  if (!settings || typeof settings !== 'object') return tenant

  const s = settings as Record<string, unknown>
  if (!s.sms_gateway) return tenant

  const gw = (s.sms_gateway || {}) as Record<string, unknown>
  const publicGw: PublicSmsGateway = {
    configured: !!(gw.login && gw.password),
    enabled: gw.enabled !== false,
    phone: (gw.phone as string) || undefined,
    base_url: (gw.base_url as string) || undefined,
    has_webhook_key: !!gw.webhook_key,
  }

  return {
    ...(tenant as Record<string, unknown>),
    settings: { ...s, sms_gateway: publicGw },
  } as unknown as T
}
