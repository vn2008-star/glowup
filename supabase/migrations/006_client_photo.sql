-- 006: Add photo_url column to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS photo_url TEXT;
