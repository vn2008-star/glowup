-- =============================================
-- GlowUp — Referral System Tables
-- =============================================

-- ─── Referral Codes (one per tenant) ───
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  uses INTEGER DEFAULT 0,
  reward_type TEXT DEFAULT 'free_month',
  reward_value INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Referral Log (tracks each successful referral) ───
CREATE TABLE IF NOT EXISTS referral_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referred_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  reward_applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Indexes ───
CREATE INDEX IF NOT EXISTS idx_referral_codes_tenant ON referral_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_log_referrer ON referral_log(referrer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_log_referred ON referral_log(referred_tenant_id);

-- ─── RLS ───
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_log ENABLE ROW LEVEL SECURITY;

-- Referral codes: tenant members can view/manage their own codes
CREATE POLICY "Referral codes tenant isolation" ON referral_codes
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- Referral log: referrers can see their own referral history
CREATE POLICY "Referral log tenant isolation" ON referral_log
  FOR ALL USING (
    referrer_tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- Allow inserts to referral_log during signup (service role handles this, but add policy for safety)
CREATE POLICY "Allow referral log inserts" ON referral_log
  FOR INSERT WITH CHECK (true);

-- ─── Auto-update timestamps ───
CREATE TRIGGER trg_referral_codes_updated_at BEFORE UPDATE ON referral_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Add referred_by column to tenants if not exists ───
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS referred_by TEXT;
