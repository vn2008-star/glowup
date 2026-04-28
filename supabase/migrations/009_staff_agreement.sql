-- =============================================
-- 009: Staff Employee Agreement Fields
-- Adds agreement signature and signed date to staff table
-- =============================================

ALTER TABLE staff ADD COLUMN IF NOT EXISTS agreement_signature TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS agreement_signed_at TIMESTAMPTZ;
