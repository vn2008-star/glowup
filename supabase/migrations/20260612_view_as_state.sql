-- Admin "View As" impersonation state
-- Stores which tenant an admin is currently impersonating
-- Keyed by admin user_id (one active session per admin)
CREATE TABLE IF NOT EXISTS view_as_state (
  user_id UUID PRIMARY KEY,
  target_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  activated_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS — only accessed via service role from server APIs
ALTER TABLE view_as_state ENABLE ROW LEVEL SECURITY;
