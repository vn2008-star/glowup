// ─── StatusBadge ───
// The one place an appointment status gets a colour and a label. Confirmed
// was purple on the calendar and Front Desk but green on Home and the manage
// page; this reads the --status-* tokens, so every screen agrees.

const LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  blocked: 'Blocked',
}

export type AppointmentStatus = keyof typeof LABELS

/** Colour token for a status, for inline needs (calendar block borders, dots). */
export function statusColor(status: string | null | undefined): string {
  const key = (status || 'pending').replace('-', '_')
  return `var(--status-${key === 'no_show' ? 'no-show' : key}, var(--status-pending))`
}

export function StatusBadge({ status, label, className }: { status: string | null | undefined; label?: string; className?: string }) {
  const key = (status || 'pending').replace('-', '_')
  const known = key in LABELS ? key : 'pending'
  return (
    <span className={`badge badge-status-${known} ${className || ''}`}>
      {label ?? LABELS[known]}
    </span>
  )
}
