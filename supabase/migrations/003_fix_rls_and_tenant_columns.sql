-- =============================================
-- GlowUp Schema Migration 003
-- Fix RLS policies for staff table (circular reference issue)
-- AND add contact columns to tenants
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Add missing columns to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Fix staff RLS policy (current one has a circular reference)
-- Drop the old policy
DROP POLICY IF EXISTS "Tenant isolation" ON staff;

-- Create a new policy that lets users read their own staff record directly
CREATE POLICY "Staff can read own record" ON staff
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Create policy for reading team members (same tenant)
CREATE POLICY "Staff can read team members" ON staff
  FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT s.tenant_id FROM staff s WHERE s.user_id = auth.uid()
  ));

-- Create policy for owners/managers to manage staff
CREATE POLICY "Owners manage staff" ON staff
  FOR ALL TO authenticated
  USING (tenant_id IN (
    SELECT s.tenant_id FROM staff s 
    WHERE s.user_id = auth.uid() AND s.role IN ('owner', 'manager')
  ))
  WITH CHECK (tenant_id IN (
    SELECT s.tenant_id FROM staff s 
    WHERE s.user_id = auth.uid() AND s.role IN ('owner', 'manager')
  ));

-- 3. Fix tenants RLS policy to also allow direct reads
DROP POLICY IF EXISTS "Tenant isolation" ON tenants;

CREATE POLICY "Staff can view own tenant" ON tenants
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT s.tenant_id FROM staff s WHERE s.user_id = auth.uid()
  ));

CREATE POLICY "Owners can update tenant" ON tenants
  FOR UPDATE TO authenticated
  USING (id IN (
    SELECT s.tenant_id FROM staff s 
    WHERE s.user_id = auth.uid() AND s.role IN ('owner', 'manager')
  ))
  WITH CHECK (id IN (
    SELECT s.tenant_id FROM staff s 
    WHERE s.user_id = auth.uid() AND s.role IN ('owner', 'manager')
  ));
