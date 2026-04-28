-- =============================================
-- 008: GlowUp Feature Expansion Migration
-- Adds: waitlist, packages, gift_cards tables
-- Modifies: service_history (adds formula column)
-- =============================================

-- ─── Waitlist ───
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  preferred_date DATE,
  preferred_time_start TIME,
  preferred_time_end TIME,
  status TEXT DEFAULT 'waiting',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_tenant ON waitlist(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(tenant_id, status);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Waitlist tenant isolation" ON waitlist
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- ─── Packages & Memberships ───
CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'bundle',
  services JSONB DEFAULT '[]',
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  original_price DECIMAL(10,2),
  validity_days INTEGER DEFAULT 365,
  max_redemptions INTEGER,
  times_sold INTEGER DEFAULT 0,
  revenue_generated DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packages_tenant ON packages(tenant_id);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Packages tenant isolation" ON packages
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

CREATE TRIGGER trg_packages_updated_at BEFORE UPDATE ON packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Gift Cards ───
CREATE TABLE IF NOT EXISTS gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  initial_amount DECIMAL(10,2) NOT NULL,
  balance DECIMAL(10,2) NOT NULL,
  purchaser_name TEXT,
  purchaser_email TEXT,
  recipient_name TEXT,
  recipient_email TEXT,
  message TEXT,
  status TEXT DEFAULT 'active',
  expires_at DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_giftcards_tenant ON gift_cards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_giftcards_code ON gift_cards(code);

ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gift cards tenant isolation" ON gift_cards
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- ─── Service History Enhancement ───
ALTER TABLE service_history ADD COLUMN IF NOT EXISTS formula TEXT;

-- ─── Intake Forms (stored in client preferences, no new table needed) ───
-- Using existing clients.preferences JSONB + clients.allergies TEXT[]
