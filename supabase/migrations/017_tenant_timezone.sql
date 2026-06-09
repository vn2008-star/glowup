-- 017: Add timezone column to tenants for nationwide US support
-- Stores IANA timezone identifier (e.g., 'America/New_York', 'America/Chicago')
-- Defaults to Pacific time since all current salons are in that timezone.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Los_Angeles';
