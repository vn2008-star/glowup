-- =============================================
-- GlowUp — Outreach Campaign Enhancements
-- Adds template tracking and follow-up support
-- =============================================

-- Template tracking
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS template_id TEXT DEFAULT 'feature_showcase';
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0;
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMPTZ;
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS last_template_id TEXT;

-- Indexes for follow-up queries
CREATE INDEX IF NOT EXISTS idx_outreach_follow_up
  ON outreach_campaigns(status, signed_up, sent_at, follow_up_count)
  WHERE status = 'sent' AND signed_up = false;
