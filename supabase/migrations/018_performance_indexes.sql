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

-- Reminder cron: find pending reminders efficiently
-- Used by: send-reminders → eq('status', 'pending').eq('type', '24h')
CREATE INDEX IF NOT EXISTS idx_reminders_status_type 
  ON appointment_reminders(status, type);

-- Tenant lookup by slug (already UNIQUE constraint, but explicit index
-- ensures fast lookups on every public booking page load)
-- Skip if slug already has a unique index from the table definition
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'tenants' AND indexdef LIKE '%slug%'
  ) THEN
    CREATE UNIQUE INDEX idx_tenants_slug ON tenants(slug);
  END IF;
END $$;
