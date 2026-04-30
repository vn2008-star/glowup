-- Add PIN column to staff table for shared tablet authentication
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin TEXT DEFAULT NULL;

-- Comment for clarity
COMMENT ON COLUMN staff.pin IS '4-digit PIN for shared tablet access (plain text)';
