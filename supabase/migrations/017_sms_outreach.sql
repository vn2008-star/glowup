-- =============================================
-- GlowUp — SMS Outreach Support
-- Adds channel tracking (email vs sms) to outreach_campaigns
-- =============================================

-- Channel column: 'email' or 'sms'
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'email';

-- Phone-based dedup index
CREATE INDEX IF NOT EXISTS idx_outreach_phone
  ON outreach_campaigns(phone)
  WHERE phone IS NOT NULL;

-- Channel filter index
CREATE INDEX IF NOT EXISTS idx_outreach_channel
  ON outreach_campaigns(channel, status, created_at);
