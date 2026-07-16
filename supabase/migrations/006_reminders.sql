-- =============================================
-- GlowUp Reminders — Migration 006
-- Automatic appointment reminders (SMS + Email)
-- =============================================
--
-- NOTE (2026-07-16): this migration was written 2026-04-27 but never applied to
-- production, and the application moved on without it. Three defects were found
-- and corrected before it was first run — see the inline notes on each. If you
-- are reading this in a diff: nothing was ever created from the old version, so
-- there is no deployed schema to reconcile against.

-- ─── 1. Add SMS opt-out flag to clients ───
-- DEFAULT false = existing clients are treated as opted IN. Consent collected
-- by the booking form between 2026-07-15 and this migration was discarded
-- (the column did not exist), so it cannot be honoured retroactively.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN DEFAULT false;

-- ─── 2. Appointment Reminders table ───
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  -- FIX: was CHECK (type IN ('24h')). The app schedules 24h, 2h and 1h
  -- (REMINDER_TYPES in src/lib/notifications.ts, and the loops in
  -- public-booking / manage-appointment). A multi-row INSERT is atomic, so the
  -- old constraint rejected the whole batch and NO reminders were ever created.
  type TEXT NOT NULL CHECK (type IN ('24h', '2h', '1h')),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- FIX: added. trg_reminders_updated_at below calls update_updated_at(), which
  -- does `NEW.updated_at = now()`. Without this column every UPDATE raised
  -- `record "new" has no field "updated_at"` — and send-reminders marks rows
  -- 'sent' via UPDATE without checking the error, so each reminder would have
  -- been re-sent on every hourly cron run for as long as it stayed in the
  -- window. That is a duplicate-SMS loop, billed per message.
  updated_at TIMESTAMPTZ DEFAULT now()
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

DROP POLICY IF EXISTS "Reminders tenant isolation" ON appointment_reminders;
CREATE POLICY "Reminders tenant isolation" ON appointment_reminders
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- ─── 4. Reminder rows are created by the application, not a trigger ───
-- FIX: the original migration created generate_appointment_reminders(), an
-- AFTER INSERT trigger on appointments that inserted two '24h' rows. The app
-- now schedules reminders itself (scheduleClientReminders in
-- src/lib/notifications.ts, plus public-booking and manage-appointment), which
-- also covers 2h/1h and only creates rows for channels the client can actually
-- receive on. Both together collide: the trigger's rows land first, then the
-- app's non-upsert INSERT hits idx_reminder_unique and the whole batch fails.
-- The app also owns cancel (status → 'skipped') and reschedule (delete +
-- recreate), so the trigger's ELSIF branch is redundant too.
--
-- Deliberately not created. If reminder scheduling is ever moved back into the
-- database, remove the app-side scheduling in the same change.
DROP TRIGGER IF EXISTS trg_generate_reminders ON appointments;
DROP FUNCTION IF EXISTS generate_appointment_reminders();

-- ─── 5. Auto-timestamp ───
DROP TRIGGER IF EXISTS trg_reminders_updated_at ON appointment_reminders;
CREATE TRIGGER trg_reminders_updated_at BEFORE UPDATE ON appointment_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
