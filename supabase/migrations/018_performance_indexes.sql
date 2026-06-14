-- =============================================
-- Performance Indexes — Disk IO Optimization
-- Adds composite indexes for hot query patterns
-- that were previously doing sequential scans.
-- =============================================

-- Public booking: appointment availability checks
-- Used by: public-booking GET (every booking page load)
-- and run-automations (no-show, review request)
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_status_time 
  ON appointments(tenant_id, status, start_time);

-- Public booking: filter by end_time for in-progress appointments
-- Used by: public-booking GET → gt('end_time', now)
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_end_time 
  ON appointments(tenant_id, end_time);

-- Public booking: client upsert by email
-- Used by: public-booking POST → eq('email', client_email)
CREATE INDEX IF NOT EXISTS idx_clients_tenant_email 
  ON clients(tenant_id, email) WHERE email IS NOT NULL;

-- Public booking: client upsert by phone
-- Used by: public-booking POST → eq('phone', client_phone)
CREATE INDEX IF NOT EXISTS idx_clients_tenant_phone 
  ON clients(tenant_id, phone) WHERE phone IS NOT NULL;

-- Rebooking automation: find stale clients by last_visit
-- Used by: run-automations → lte('last_visit', cycleAgo)
CREATE INDEX IF NOT EXISTS idx_clients_tenant_last_visit 
  ON clients(tenant_id, last_visit) WHERE last_visit IS NOT NULL;

-- Note: appointment_reminders(status, type) index already exists
-- from 006_reminders.sql as a partial index (WHERE status = 'pending'),
-- which is even more efficient than a full index.

-- Note: tenants(slug) already has a UNIQUE constraint from the
-- table definition, so no additional index is needed.

