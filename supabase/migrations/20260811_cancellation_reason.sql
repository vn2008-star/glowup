-- Cancellation reasons: why an appointment was cancelled, and by whom.
--
-- Paste this into the Supabase SQL Editor (this project has no applied
-- migration history — the dashboard reports "No migrations", so files here are
-- a record of intent, not of what ran). Until it is applied, the app still
-- cancels appointments; it just drops the reason and logs a warning. Run
-- `npm run gen:types` afterwards.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by text;

COMMENT ON COLUMN appointments.cancellation_reason IS
  'Free-text reason captured at cancellation, from the salon or the client. Max 500 chars, enforced in the app.';
COMMENT ON COLUMN appointments.cancelled_by IS
  '''salon'' (dashboard) or ''client'' (manage link).';

-- Reporting: "why are we losing appointments" over a date range.
CREATE INDEX IF NOT EXISTS idx_appointments_cancelled
  ON appointments (tenant_id, status, start_time)
  WHERE status = 'cancelled';
