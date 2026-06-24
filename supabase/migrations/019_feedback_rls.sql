-- =============================================
-- Enable RLS on feedback table (security fix)
-- The feedback table was missing RLS, making it publicly accessible
-- =============================================

-- Enable RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Tenant members can view their own feedback
CREATE POLICY "Feedback tenant read" ON feedback
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- Tenant members can submit feedback
CREATE POLICY "Feedback tenant insert" ON feedback
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid())
  );

-- Only owners/managers can update feedback (change status, add notes)
CREATE POLICY "Feedback tenant update" ON feedback
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager'))
  );

-- Only owners can delete feedback
CREATE POLICY "Feedback tenant delete" ON feedback
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM staff WHERE user_id = auth.uid() AND role = 'owner')
  );
