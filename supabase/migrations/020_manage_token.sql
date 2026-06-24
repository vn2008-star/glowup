-- =============================================
-- Add manage_token to appointments for self-service cancel/reschedule
-- Clients receive a link with this token to manage their appointment
-- =============================================

-- Add the column with auto-generated UUIDs
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS manage_token UUID DEFAULT gen_random_uuid();

-- Backfill existing rows that got NULL
UPDATE appointments SET manage_token = gen_random_uuid() WHERE manage_token IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE appointments ALTER COLUMN manage_token SET NOT NULL;

-- Unique index for fast token lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_manage_token ON appointments(manage_token);
