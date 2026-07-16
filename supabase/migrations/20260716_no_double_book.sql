-- =============================================
-- Prevent double-booking at the database
-- 2026-07-16
-- =============================================
--
-- Nothing at any layer stopped two appointments landing on one staff member at
-- the same time:
--
--   * The dashboard write path (api/data → appointments.add) is an
--     unconditional INSERT. No overlap check, no hours check, no staff-off
--     check. The booking modal is a bare date/time input with nothing disabled,
--     and the week grid lays overlapping blocks out side-by-side so nobody
--     notices it happened.
--   * The public flow DOES check (api/public-booking), so customer→dashboard
--     collisions are caught and dashboard→anything are not.
--   * Even the public check is a TOCTOU: ~5 round trips separate the SELECT
--     from the INSERT, so two simultaneous customers can both pass it.
--   * Availability is implemented five times across the codebase and no two
--     copies agree.
--
-- A constraint here fixes all of that at once, whichever path a caller took.
-- It is the only layer every write goes through.
--
-- SAFETY: verified against production before writing this — 377 appointments,
-- zero existing overlaps (even counting the 302 completed ones), no NULL or
-- backwards time ranges. ADD CONSTRAINT applies without rewriting data.

-- Required for `staff_id WITH =` — gist does not handle uuid equality without it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_no_double_book;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_double_book
  EXCLUDE USING gist (
    staff_id WITH =,
    -- '[)' — half-open on purpose. Back-to-back appointments (10:00-11:00 then
    -- 11:00-12:00) must NOT be treated as a conflict; a closed upper bound
    -- would reject every consecutive booking in the day.
    tstzrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (
    -- Time blocks and walk-ins with no staff assigned are not policed: there is
    -- no resource to contend for. NOTE this leaves the "Any Available" hole
    -- open (BookingClient sends staff_id = null and the server accepts every
    -- slot) — that needs assigning a real staff member at booking time, which
    -- is an app fix, not something a constraint can express.
    staff_id IS NOT NULL
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL
    -- Guards the range expression against rows tstzrange() would reject.
    AND end_time > start_time
    -- Matches what api/public-booking already treats as "occupied", so the
    -- database agrees with the app rather than surprising it. 'cancelled' frees
    -- the slot. 'completed' is deliberately excluded: it is history, and
    -- policing it would block retroactive record-keeping. Verified either way —
    -- there are zero overlaps among completed rows today.
    AND status IN ('pending', 'confirmed', 'blocked')
  );

-- tenant_id is intentionally absent: staff_id is a uuid primary key belonging to
-- exactly one tenant, so equality on it already implies the same tenant.
--
-- On violation Postgres raises SQLSTATE 23P01 (exclusion_violation). Both write
-- paths map that to a friendly message rather than leaking the raw text —
-- api/public-booking returns the same 409 its own pre-check returns, which
-- BookingClient already handles by refreshing availability.
