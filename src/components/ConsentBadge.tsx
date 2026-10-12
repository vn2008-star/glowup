'use client'

// Consent status for one client, with the two things staff do about it:
// hand them the tablet (the form opens in a dialog, "kiosk" mode) or copy
// the link to text them. Used in the Clients drawer and the Front Desk
// checkout panel; it fetches its own status so callers need only a client id.

import { useCallback, useEffect, useState } from 'react'
import { queryData } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Dialog } from '@/components/ui/Dialog'
import { Icon } from '@/components/ui/Icon'
import ConsentClient from '@/app/consent/[token]/ConsentClient'
import type { ConsentState, SignedConsent } from '@/lib/consent-shared'
import styles from './ConsentBadge.module.css'

interface ConsentLink {
  enabled: boolean
  token: string
  url: string
  state: ConsentState
  signed: (SignedConsent & { signature_url: string | null; questions: { id: string; label: string }[] }) | null
}

export function ConsentBadge({ clientId, compact = false }: { clientId: string; compact?: boolean }) {
  const toast = useToast()
  const [info, setInfo] = useState<ConsentLink | null>(null)
  const [kiosk, setKiosk] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    queryData<ConsentLink>('clients.consent-link', { client_id: clientId }).then(({ data }) => { if (data) setInfo(data) })
  }, [clientId])
  useEffect(load, [load])

  if (!info || !info.enabled) return null

  const { state } = info
  const dateStr = 'signed_at' in state ? new Date(state.signed_at).toLocaleDateString() : ''
  const tone = state.status === 'valid' ? styles.ok : state.status === 'none' ? styles.missing : styles.warn
  const label =
    state.status === 'valid' ? `Consent signed ${dateStr}`
    : state.status === 'expired' ? `Consent expired (signed ${dateStr})`
    : state.status === 'outdated' ? `Form changed since ${dateStr}`
    : 'No consent on file'

  async function copy() {
    try { await navigator.clipboard.writeText(info!.url); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { toast.error('Could not copy — long-press the link instead') }
  }

  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ''}`}>
      <span className={`${styles.badge} ${tone}`}>
        <Icon name={state.status === 'valid' ? 'check' : state.status === 'none' ? 'warning' : 'refresh'} />
        {label}
      </span>
      <div className={styles.actions}>
        {info.signed && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewing(true)}>View</button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setKiosk(true)}>
          {state.status === 'valid' ? 'Sign again' : 'Sign now'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy} title={info.url}>
          <Icon name="link" /> {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      {/* Hand the tablet over: the public form, inside the dashboard */}
      <Dialog open={kiosk} onClose={() => setKiosk(false)} title="Consent form" size="lg">
        {kiosk && (
          <ConsentClient token={info.token} initialData={null} initialError={null} kiosk onDone={() => { load() }} />
        )}
      </Dialog>

      <Dialog open={viewing} onClose={() => setViewing(false)} title="Signed consent" size="md">
        {info.signed && (
          <div className={styles.view}>
            <p className={styles.meta}>Signed by <strong>{info.signed.name}</strong> on {new Date(info.signed.signed_at).toLocaleString()} ({info.signed.via === 'kiosk' ? 'in salon' : 'online'})</p>
            <ul className={styles.answers}>
              {info.signed.questions.map(q => (
                <li key={q.id}>
                  <span className={info.signed!.answers[q.id] ? styles.yes : styles.no}>{info.signed!.answers[q.id] ? 'Yes' : 'No'}</span>
                  <span>{q.label}</span>
                </li>
              ))}
            </ul>
            <p className={styles.meta}><strong>Allergies:</strong> {info.signed.allergies || 'none listed'}</p>
            <p className={styles.meta}><strong>Photo consent:</strong> {info.signed.photo_consent ? 'yes' : 'no'}</p>
            {info.signed.signature_url && <img src={info.signed.signature_url} alt="Signature" className={styles.signature} />}
          </div>
        )}
      </Dialog>
    </div>
  )
}
