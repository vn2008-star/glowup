-- =============================================
-- 021: Fix RLS — Add missing policies to tables flagged by Supabase Security Advisor
-- Tables: outreach_campaigns, view_as_state
-- Both had RLS enabled but ZERO policies, triggering the
-- "rls_disabled_in_public" advisory alert.
-- =============================================

-- ─── outreach_campaigns ───
-- Admin-only table (bulk outreach to salon owners).
-- No tenant_id column — this is a platform-level table.
-- Only platform admins (service role) should access it.
-- Block all anon/authenticated access by default with a deny-all policy.

-- Deny all public reads
CREATE POLICY "Outreach deny public select" ON outreach_campaigns
  FOR SELECT TO authenticated
  USING (false);

-- Deny all public inserts
CREATE POLICY "Outreach deny public insert" ON outreach_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- Deny all public updates
CREATE POLICY "Outreach deny public update" ON outreach_campaigns
  FOR UPDATE TO authenticated
  USING (false);

-- Deny all public deletes
CREATE POLICY "Outreach deny public delete" ON outreach_campaigns
  FOR DELETE TO authenticated
  USING (false);

-- ─── view_as_state ───
-- Admin impersonation state table. Only accessed via service role.
-- Block all direct authenticated access.
-- Re-enable RLS (original migration may not have been applied)
ALTER TABLE view_as_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View as state deny public select" ON view_as_state
  FOR SELECT TO authenticated
  USING (false);

CREATE POLICY "View as state deny public insert" ON view_as_state
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "View as state deny public update" ON view_as_state
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "View as state deny public delete" ON view_as_state
  FOR DELETE TO authenticated
  USING (false);

-- Also block anon role explicitly
CREATE POLICY "Outreach deny anon" ON outreach_campaigns
  FOR ALL TO anon
  USING (false);

CREATE POLICY "View as state deny anon" ON view_as_state
  FOR ALL TO anon
  USING (false);
