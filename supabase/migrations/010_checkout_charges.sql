-- =============================================
-- 010: Staff Checkout & Daily Revenue Split
-- Adds: appointment_charges table, checkout fields on appointments,
--        per-service commission rates
-- =============================================

-- ─── Per-service commission rate (overrides staff default) ───
ALTER TABLE services ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2);

-- ─── Appointment checkout fields ───
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_out_by UUID REFERENCES staff(id);

-- ─── Appointment Charges (line items per appointment) ───
CREATE TABLE IF NOT EXISTS appointment_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_upsell BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_charges_appointment ON appointment_charges(appointment_id);
CREATE INDEX IF NOT EXISTS idx_charges_tenant ON appointment_charges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_charges_staff ON appointment_charges(staff_id);
CREATE INDEX IF NOT EXISTS idx_appointments_checkout ON appointments(tenant_id, checked_out_at);

-- RLS
ALTER TABLE appointment_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Charges tenant isolation" ON appointment_charges
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );
