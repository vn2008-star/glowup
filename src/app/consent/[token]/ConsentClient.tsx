'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/components/ui/Toast'
import styles from './consent.module.css'

export interface ConsentPayload {
  business: { name: string; slug: string | null; logo_url: string | null; phone: string | null; brand_color: string | null }
  client: { first_name: string; last_name: string | null }
  form: { enabled: boolean; questions: { id: string; label: string }[]; terms: string; photo_consent: boolean }
  state: { status: 'none' | 'valid' | 'expired' | 'outdated'; signed_at?: string; name?: string }
  existing: { signed_at: string; name: string; answers: Record<string, boolean>; allergies: string; photo_consent: boolean } | null
}

function fullName(d: ConsentPayload) {
  return `${d.client.first_name} ${d.client.last_name || ''}`.trim()
}

export default function ConsentClient({ token, initialData, initialError, kiosk = false, onDone }: {
  token: string
  initialData: ConsentPayload | null
  initialError: string | null
  /** Front Desk tablet: no "done" screen chrome, hand back to the caller */
  kiosk?: boolean
  onDone?: () => void
}) {
  const t = useTranslations('consent')
  const pageClass = kiosk ? `${styles.page} ${styles.embedded}` : styles.page
  const toast = useToast()
  const [data, setData] = useState<ConsentPayload | null>(initialData)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(!initialData && !initialError)

  // Prefilled from the client record so a re-sign is quick
  const [name, setName] = useState(() => initialData ? fullName(initialData) : '')
  const [answers, setAnswers] = useState<Record<string, boolean | undefined>>(() => initialData?.existing?.answers || {})
  const [allergies, setAllergies] = useState(() => initialData?.existing?.allergies || '')
  const [agree, setAgree] = useState(false)
  const [photoOk, setPhotoOk] = useState(() => initialData?.existing ? initialData.existing.photo_consent : true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [hasSigned, setHasSigned] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  useEffect(() => {
    if (initialData || initialError) return
    ;(async () => {
      try {
        const res = await fetch(`/api/consent?token=${encodeURIComponent(token)}`)
        if (!res.ok) { setError('This link is not valid.'); return }
        const d = (await res.json()) as ConsentPayload
        setData(d)
        setName(fullName(d))
        if (d.existing) { setAnswers(d.existing.answers || {}); setAllergies(d.existing.allergies || ''); setPhotoOk(d.existing.photo_consent) }
      } catch { setError('Could not load the form.') }
      finally { setLoading(false) }
    })()
  }, [token, initialData, initialError])

  // ── Signature pad ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * 2)
    canvas.height = Math.round(rect.height * 2)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(2, 2)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = getComputedStyle(canvas).color
  }, [data, done])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    drawing.current = true
    const p = pos(e)
    ctx.beginPath(); ctx.moveTo(p.x, p.y)
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    ctx.lineTo(p.x, p.y); ctx.stroke()
    if (!hasSigned) setHasSigned(true)
  }
  function onUp() { drawing.current = false }
  function clearSignature() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSigned(false)
  }

  const brandStyle = (() => {
    const hex = data?.business.brand_color
    if (!hex) return undefined
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return { '--booking-brand': hex, '--booking-brand-ink': luma > 0.62 ? '#1e1528' : '#ffffff' } as React.CSSProperties
  })()

  const allAnswered = data ? data.form.questions.every(q => typeof answers[q.id] === 'boolean') : false
  const canSubmit = allAnswered && agree && hasSigned && name.trim().length >= 2 && !submitting

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !canvasRef.current) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), answers, allergies, photo_consent: photoOk, signature: canvasRef.current.toDataURL('image/png'), via: kiosk ? 'kiosk' : 'web' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error || t('failed')); return }
      setDone(true)
      onDone?.()
    } catch { toast.error(t('failed')) }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className={pageClass}><div className={styles.card}><p className={styles.muted}>{t('loading')}</p></div></div>
  if (error || !data) return <div className={pageClass}><div className={styles.card}><h1 className={styles.title}>{t('invalidTitle')}</h1><p className={styles.muted}>{error || t('invalidText')}</p></div></div>

  const { business, form } = data

  if (!form.enabled) {
    return (
      <div className={pageClass} style={brandStyle}>
        <div className={styles.card}><h1 className={styles.title}>{business.name}</h1><p className={styles.muted}>{t('notEnabled')}</p></div>
      </div>
    )
  }

  if (done) {
    return (
      <div className={pageClass} style={brandStyle}>
        <div className={styles.card}>
          <div className={styles.doneIcon} aria-hidden="true">✓</div>
          <h1 className={styles.title}>{t('doneTitle')}</h1>
          <p className={styles.muted}>{t('doneText', { name: business.name })}</p>
          {business.slug && !kiosk && <a className={styles.linkBtn} href={`/book/${business.slug}`}>{t('backToBooking')}</a>}
        </div>
      </div>
    )
  }

  return (
    <div className={pageClass} style={brandStyle}>
      <form className={styles.card} onSubmit={submit}>
        <div className={styles.brand}>
          {business.logo_url ? <img src={business.logo_url} alt="" className={styles.logo} /> : <div className={styles.logoFallback}>{business.name[0]}</div>}
          <div>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={styles.muted}>{business.name}</p>
          </div>
        </div>

        {data.state.status !== 'none' && data.existing && (
          <p className={styles.notice}>
            {data.state.status === 'valid' ? t('alreadySigned', { date: new Date(data.existing.signed_at).toLocaleDateString() }) : t('resignNeeded')}
          </p>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('healthQuestions')}</h2>
          <p className={styles.muted}>{t('healthHint')}</p>
          <ol className={styles.questions}>
            {form.questions.map(q => (
              <li key={q.id} className={styles.question}>
                <span className={styles.questionLabel}>{q.label}</span>
                <div className={styles.yesNo} role="radiogroup" aria-label={q.label}>
                  {[true, false].map(v => (
                    <button
                      key={String(v)}
                      type="button"
                      role="radio"
                      aria-checked={answers[q.id] === v}
                      className={`${styles.choice} ${answers[q.id] === v ? styles.choiceOn : ''}`}
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: v }))}
                    >
                      {v ? t('yes') : t('no')}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section}>
          <label className={styles.label} htmlFor="consent-allergies">{t('allergies')}</label>
          <textarea id="consent-allergies" className={styles.textarea} rows={2} value={allergies} onChange={e => setAllergies(e.target.value)} placeholder={t('allergiesPlaceholder')} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('terms')}</h2>
          <div className={styles.terms}>{form.terms}</div>
          <label className={styles.check}>
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span>{t('agree')}</span>
          </label>
          {form.photo_consent && (
            <label className={styles.check}>
              <input type="checkbox" checked={photoOk} onChange={e => setPhotoOk(e.target.checked)} />
              <span>{t('photoConsent')}</span>
            </label>
          )}
        </section>

        <section className={styles.section}>
          <label className={styles.label} htmlFor="consent-name">{t('typedName')}</label>
          <input id="consent-name" className={styles.input} value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          <div className={styles.sigHead}>
            <span className={styles.label}>{t('signature')}</span>
            {hasSigned && <button type="button" className={styles.clearBtn} onClick={clearSignature}>{t('clear')}</button>}
          </div>
          <canvas
            ref={canvasRef}
            className={styles.signature}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
            aria-label={t('signature')}
          />
          <p className={styles.muted}>{t('signHint')}</p>
        </section>

        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          {submitting ? t('saving') : t('submit')}
        </button>
        <p className={styles.fine}>{t('fine', { date: new Date().toLocaleDateString() })}</p>
      </form>
    </div>
  )
}
