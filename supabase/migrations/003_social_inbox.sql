-- =============================================
-- GlowUp Migration 003 — Social Media & Inbox
-- Run this in Supabase SQL Editor
-- =============================================

-- ─── 1. Social Posts ───
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content TEXT,
  image_urls TEXT[] DEFAULT '{}',
  platforms TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft', -- draft, scheduled, published
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  template_type TEXT, -- before_after, promotion, review, custom
  metrics JSONB DEFAULT '{"likes":0,"comments":0,"shares":0,"reach":0}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 2. Conversations ───
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  channel TEXT DEFAULT 'sms', -- sms, instagram, facebook, web
  status TEXT DEFAULT 'open', -- open, closed, archived
  assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL,
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 3. Messages ───
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL DEFAULT 'client', -- client, staff, bot
  sender_name TEXT,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- booking_id, attachment_url, etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_social_posts_tenant ON social_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Social posts tenant isolation" ON social_posts
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

CREATE POLICY "Conversations tenant isolation" ON conversations
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

CREATE POLICY "Messages tenant isolation" ON messages
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- =============================================
-- TRIGGERS
-- =============================================
CREATE TRIGGER trg_social_posts_updated_at BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
