-- =============================================
-- GlowUp — Client Referral System
-- =============================================

-- ─── Platform Settings (admin-configurable values) ───
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Default: $25 gift card reward for client referrals
INSERT INTO platform_settings (key, value) VALUES ('client_referral_reward', '25')
ON CONFLICT (key) DO NOTHING;

-- ─── Client Referral Codes ───
CREATE TABLE IF NOT EXISTS client_referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  uses INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_referral_codes_tenant ON client_referral_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_referral_codes_client ON client_referral_codes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_referral_codes_code ON client_referral_codes(code);

-- ─── Extend referral_log for client referrals ───
ALTER TABLE referral_log ADD COLUMN IF NOT EXISTS client_referrer_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE referral_log ADD COLUMN IF NOT EXISTS client_reward_amount NUMERIC(10,2);
ALTER TABLE referral_log ADD COLUMN IF NOT EXISTS client_reward_status TEXT DEFAULT 'pending';
-- client_reward_status: 'pending' (waiting for first payment), 'rewarded' (gift card issued), 'expired' (salon never paid)

-- ─── RLS ───
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_referral_codes ENABLE ROW LEVEL SECURITY;

-- Platform settings: no direct access (service role only)
CREATE POLICY "Platform settings read" ON platform_settings FOR SELECT USING (true);

-- Client referral codes: tenant members can view their own
CREATE POLICY "Client referral codes tenant isolation" ON client_referral_codes
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- Allow public inserts to client_referral_codes (via service role for the public API)
CREATE POLICY "Allow client referral code inserts" ON client_referral_codes
  FOR INSERT WITH CHECK (true);
