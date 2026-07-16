-- =============================================
-- Fix RLS infinite recursion on staff
-- 2026-07-16
-- =============================================
--
-- SYMPTOM: every tenant-scoped table (staff, clients, appointments, tenants,
-- services, appointment_reminders, ...) raised
--     ERROR: infinite recursion detected in policy for relation "staff"
-- for the anon and authenticated roles. RLS was therefore providing no access
-- control at all — it denied everything by erroring. Nothing noticed because
-- all 30 API routes use the service role, which bypasses RLS entirely.
--
-- CAUSE: a policy ON staff whose USING clause sub-selects FROM staff re-enters
-- itself forever. 003_fix_rls_and_tenant_columns.sql set out to fix exactly
-- this, but (a) its `DROP POLICY IF EXISTS "Tenant isolation" ON staff` named a
-- policy that never existed — 001 calls it "Staff tenant isolation" — so the
-- drop silently no-opped, and (b) it then created two MORE self-referencing
-- policies ("Staff can read team members", "Owners manage staff"). Policies are
-- OR'd, so one recursive policy poisons the table, and every other table's
-- policy sub-selects FROM staff and inherits it.
--
-- FIX: resolve the caller's tenant through a SECURITY DEFINER function, which
-- reads staff without re-entering its RLS, and rebuild staff's policies against
-- that instead of a self-subquery.
--
-- SAFETY: no client-side code reads tables with the anon key — the browser
-- Supabase client is used only for auth (signIn/getUser/resetPassword), and all
-- data flows through /api/data on the service role. So these policies can be
-- strict without affecting the running app. RLS here is defence-in-depth for
-- the day a route forgets its .eq('tenant_id', ...).

-- ─── 1. Tenant/role resolvers that do NOT re-enter staff RLS ───
-- SECURITY DEFINER runs as the function owner, so the read inside is not
-- subject to the policies we are about to define. search_path is pinned so the
-- definer's rights cannot be redirected at a hostile schema.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_staff_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated;

-- ─── 2. Drop EVERY existing policy on staff, by discovery ───
-- Deliberately not by name. This database was built by pasting SQL by hand
-- (the dashboard reports "No migrations"), so the policies that actually exist
-- are not guaranteed to match any file in this repo. Naming them is precisely
-- how 003's fix failed silently. Ask the catalog instead.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.staff', p.policyname);
    RAISE NOTICE 'dropped staff policy: %', p.policyname;
  END LOOP;
END $$;

-- ─── 3. Rebuild staff policies without self-reference ───

-- Read your own team.
CREATE POLICY staff_select_same_tenant ON public.staff
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Only owners/managers add staff, and only into their own tenant.
-- NOTE: the old policies ended in `OR (user_id = auth.uid())` with no tenant
-- constraint, which let any user insert a staff row into ANY tenant. First-time
-- signup does not need this — /api/setup-tenant creates that row with the
-- service role — so the self-insert escape is gone rather than reproduced.
CREATE POLICY staff_insert_by_owner ON public.staff
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_staff_role() IN ('owner', 'manager')
  );

-- WITH CHECK pins the post-update tenant_id to the caller's CURRENT tenant.
-- current_tenant_id() is STABLE, so it resolves against the pre-update snapshot
-- and a row cannot be walked into another tenant. The old UPDATE policy had a
-- USING clause and no WITH CHECK, which is what made that possible.
CREATE POLICY staff_update_by_owner ON public.staff
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_staff_role() IN ('owner', 'manager')
  )
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY staff_delete_by_owner ON public.staff
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_staff_role() IN ('owner', 'manager')
  );

-- ─── 4. Other tables need no change ───
-- Their policies read `tenant_id IN (SELECT tenant_id FROM staff WHERE
-- user_id = auth.uid())`. That sub-select applies staff's RLS, which now
-- resolves through current_tenant_id() and terminates. Fixing staff unblocks
-- every table that depends on it.
