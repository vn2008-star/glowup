import type { SupabaseClient } from '@supabase/supabase-js'

const CANCEL_SELECT =
  'id, client_id, start_time, end_time, status, notes, client:clients(first_name, last_name, phone, email, sms_opt_out), service:services(name), staff_member:staff!staff_id(name)'

/** Who asked for the cancellation — recorded alongside the reason. */
export type CancelledBy = 'salon' | 'client'

/**
 * Cancel an appointment, recording why.
 *
 * The reason is written to `appointments.cancellation_reason`. That column may
 * not exist yet — this database's schema was built by hand in the SQL Editor
 * and drifts from supabase/migrations (see 20260811_cancellation_reason.sql for the
 * statement to run). If PostgREST rejects the column, the cancellation is
 * retried WITHOUT it rather than failing: losing the reason is a small problem,
 * refusing to cancel a client's appointment is a big one.
 */
export async function cancelAppointment(
  svc: SupabaseClient,
  tenantId: string,
  appointmentId: string,
  reason: string,
  cancelledBy: CancelledBy
) {
  const trimmed = (reason || '').trim().slice(0, 500)

  const base: Record<string, unknown> = { status: 'cancelled' }
  const withReason = trimmed
    ? { ...base, cancellation_reason: trimmed, cancelled_by: cancelledBy }
    : base

  let { data, error } = await svc
    .from('appointments')
    .update(withReason)
    .eq('id', appointmentId)
    .eq('tenant_id', tenantId)
    .select(CANCEL_SELECT)
    .single()

  // PGRST204 = column not found in schema cache; 42703 = undefined_column.
  const missingColumn =
    error && (error.code === 'PGRST204' || error.code === '42703' ||
      /cancellation_reason|cancelled_by/i.test(error.message || ''))

  if (missingColumn) {
    console.warn(
      '[cancel] cancellation_reason/cancelled_by column missing — cancelling without the reason. ' +
      'Apply supabase/migrations/20260811_cancellation_reason.sql to keep them.'
    )
    ;({ data, error } = await svc
      .from('appointments')
      .update(base)
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .select(CANCEL_SELECT)
      .single())
  }

  return { data, error, reason: trimmed }
}
