-- =============================================
-- GlowUp Reminders — Migration 006
-- Automatic appointment reminders (SMS + Email)
-- =============================================

-- ─── 1. Add SMS opt-out flag to clients ───
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN DEFAULT false;

-- ─── 2. Appointment Reminders table ───
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('24h')),       -- '24h' only for free tier
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Prevent duplicate reminders for same appointment + type + channel
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_unique
  ON appointment_reminders(appointment_id, type, channel);

-- Fast query for cron: find pending reminders
CREATE INDEX IF NOT EXISTS idx_reminders_pending
  ON appointment_reminders(status, type)
  WHERE status = 'pending';

-- Tenant isolation index
CREATE INDEX IF NOT EXISTS idx_reminders_tenant
  ON appointment_reminders(tenant_id);

-- ─── 3. RLS ───
ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reminders tenant isolation" ON appointment_reminders
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- ─── 4. Trigger: Auto-generate reminder rows on appointment insert/update ───
CREATE OR REPLACE FUNCTION generate_appointment_reminders()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate for confirmed or pending appointments
  IF NEW.status IN ('pending', 'confirmed') THEN
    -- 24h SMS reminder
    INSERT INTO appointment_reminders (tenant_id, appointment_id, client_id, type, channel, status)
    VALUES (NEW.tenant_id, NEW.id, NEW.client_id, '24h', 'sms', 'pending')
    ON CONFLICT (appointment_id, type, channel) DO NOTHING;

    -- 24h Email reminder
    INSERT INTO appointment_reminders (tenant_id, appointment_id, client_id, type, channel, status)
    VALUES (NEW.tenant_id, NEW.id, NEW.client_id, '24h', 'email', 'pending')
    ON CONFLICT (appointment_id, type, channel) DO NOTHING;

  ELSIF NEW.status IN ('cancelled', 'no_show') THEN
    -- Cancel pending reminders if appointment is cancelled
    UPDATE appointment_reminders
    SET status = 'skipped'
    WHERE appointment_id = NEW.id AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_generate_reminders
  AFTER INSERT OR UPDATE OF status ON appointments
  FOR EACH ROW EXECUTE FUNCTION generate_appointment_reminders();

-- ─── 5. Auto-timestamp ───
CREATE TRIGGER trg_reminders_updated_at BEFORE UPDATE ON appointment_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
