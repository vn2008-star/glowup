-- =============================================
-- GlowUp Reminders — 30-minute nudge + owner copies
-- 2026-08-28
-- =============================================
--
-- Adds two things the app now schedules:
--   1. a '30m' reminder type (Settings → Reminders → "30 minutes before")
--   2. 'owner_sms' / 'owner_email' channels, so the salon owner can get the
--      same per-appointment heads-up the client gets.
--
-- VERIFIED against production on 2026-08-28: the live table still carries the
-- CHECK constraints created by migration 006 under their default names —
--   appointment_reminders_type_check    → type IN ('24h','2h','1h')
--   appointment_reminders_channel_check → channel IN ('sms','email')
-- Both reject the new values with 23514, and a multi-row INSERT is atomic, so
-- until this runs the app writes the new rows in a SEPARATE batch (see
-- insertReminderRows in src/lib/notifications.ts) — an unmigrated database
-- loses only the 30m/owner rows, never the 24h/2h/1h ones.
--
-- Owner rows keep client_id populated: send-reminders joins clients!inner to
-- build the "Jane D. — Balayage at 2:30" line, and a NULL would drop the row.

ALTER TABLE appointment_reminders
  DROP CONSTRAINT IF EXISTS appointment_reminders_type_check;
ALTER TABLE appointment_reminders
  ADD CONSTRAINT appointment_reminders_type_check
  CHECK (type IN ('24h', '2h', '1h', '30m'));

ALTER TABLE appointment_reminders
  DROP CONSTRAINT IF EXISTS appointment_reminders_channel_check;
ALTER TABLE appointment_reminders
  ADD CONSTRAINT appointment_reminders_channel_check
  CHECK (channel IN ('sms', 'email', 'owner_sms', 'owner_email'));

-- idx_reminder_unique is (appointment_id, type, channel) — the new channels get
-- their own slots automatically, so owner and client rows can't collide.
