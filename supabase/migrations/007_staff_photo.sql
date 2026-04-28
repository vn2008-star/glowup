-- 007: Add photo_url column to staff
ALTER TABLE staff ADD COLUMN IF NOT EXISTS photo_url TEXT;
