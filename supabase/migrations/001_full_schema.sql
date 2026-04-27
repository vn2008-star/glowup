-- =============================================
-- GlowUp Database Schema — Full Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- =============================================

-- ─── 1. Tenants (Business Accounts) ───
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  business_type TEXT DEFAULT 'nail_salon',
  plan TEXT DEFAULT 'free',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 2. Staff (Users linked to tenants) ───
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'technician',
  email TEXT,
  phone TEXT,
  specialties TEXT[] DEFAULT '{}',
  schedule JSONB DEFAULT '{}',
  commission_rate DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 3. Clients ───
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  birthday DATE,
  preferences JSONB DEFAULT '{}',
  allergies TEXT[] DEFAULT '{}',
  notes TEXT,
  loyalty_points INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  lifetime_spend DECIMAL(10,2) DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  last_visit DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 4. Services ───
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 5. Appointments ───
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  total_price DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 6. Campaigns ───
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'promo',
  template JSONB DEFAULT '{}',
  audience JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  metrics JSONB DEFAULT '{"sent":0,"opened":0,"booked":0,"revenue":0}',
  last_sent TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 7. Service History (for photo CRM) ───
CREATE TABLE IF NOT EXISTS service_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  before_photo_urls TEXT[] DEFAULT '{}',
  after_photo_urls TEXT[] DEFAULT '{}',
  specifications JSONB DEFAULT '{}',
  satisfaction INTEGER,
  total_paid DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INDEXES for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_staff_tenant ON staff(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_user ON staff(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(tenant_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_staff ON appointments(staff_id, start_time);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_history_client ON service_history(client_id);

-- =============================================
-- ROW LEVEL SECURITY — Multi-Tenant Isolation
-- =============================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_history ENABLE ROW LEVEL SECURITY;

-- Helper: Get current user's tenant IDs (a user could belong to multiple tenants)
-- We use a subquery pattern for RLS policies

-- ─── Tenants: Users can see tenants they belong to ───
CREATE POLICY "Users can view own tenants" ON tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own tenants" ON tenants
  FOR UPDATE USING (
    id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager'))
  );

-- Allow inserts for new signups (service role or authenticated users creating their first tenant)
CREATE POLICY "Authenticated users can create tenants" ON tenants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ─── Staff: Tenant members can see their co-workers ───
CREATE POLICY "Staff tenant isolation" ON staff
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM staff AS s WHERE s.user_id = auth.uid())
  );

CREATE POLICY "Owners can manage staff" ON staff
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM staff AS s WHERE s.user_id = auth.uid() AND s.role IN ('owner', 'manager'))
    OR (user_id = auth.uid()) -- Allow self-insert for new signups
  );

CREATE POLICY "Owners can update staff" ON staff
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM staff AS s WHERE s.user_id = auth.uid() AND s.role IN ('owner', 'manager'))
    OR (user_id = auth.uid()) -- Allow self-update
  );

CREATE POLICY "Owners can delete staff" ON staff
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM staff AS s WHERE s.user_id = auth.uid() AND s.role = 'owner')
  );

-- ─── Clients: Full tenant isolation ───
CREATE POLICY "Clients tenant isolation" ON clients
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- ─── Services: Full tenant isolation ───
CREATE POLICY "Services tenant isolation" ON services
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- ─── Appointments: Full tenant isolation ───
CREATE POLICY "Appointments tenant isolation" ON appointments
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- ─── Campaigns: Full tenant isolation ───
CREATE POLICY "Campaigns tenant isolation" ON campaigns
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- ─── Service History: Full tenant isolation ───
CREATE POLICY "Service history tenant isolation" ON service_history
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- =============================================
-- AUTO-TIMESTAMP: Update updated_at on changes
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- STORAGE: Client photos bucket
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Tenant members can upload/view photos in their tenant folder
CREATE POLICY "Tenant photo upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant photo view" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant photo delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM staff WHERE user_id = auth.uid() 
      AND role IN ('owner', 'manager')
    )
  );
