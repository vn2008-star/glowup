'use client'

// ─── Call button ───
// "Call ▾" with the ways to reach a client: dial, text, or copy the number.
// tel:/sms: open the phone's dialer and Messages app; on a desktop they hand
// off to whatever the OS has registered (FaceTime, Phone Link), which is why
// Copy is there too. Callers hide this when the number is masked — the real
// digits must never reach a tel: link a technician can read.

import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import styles from './CallButton.module.css'

const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
)
const MessageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
)
const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
)
const ChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
)

/** Digits for a tel:/sms: URI; 10-digit US numbers get +1 so they dial from anywhere. */
function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return phone.trim().startsWith('+') ? `+${digits}` : digits
}

export function CallButton({ phone, size = 'sm' }: { phone: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const number = dialable(phone)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function copy() {
    setOpen(false)
    try {
      await navigator.clipboard.writeText(phone)
      toast.success('Number copied')
    } catch {
      toast.error('Could not copy — select the number instead')
    }
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        className={`${styles.trigger} ${size === 'md' ? styles.md : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <PhoneIcon /> <span>Call</span> <ChevronIcon />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <a role="menuitem" className={styles.item} href={`tel:${number}`} onClick={() => setOpen(false)}>
            <PhoneIcon />
            <span className={styles.itemText}>
              <span>Call</span>
              <span className={styles.itemSub}>{phone}</span>
            </span>
          </a>
          <a role="menuitem" className={styles.item} href={`sms:${number}`} onClick={() => setOpen(false)}>
            <MessageIcon /> <span>Text message</span>
          </a>
          <button role="menuitem" type="button" className={styles.item} onClick={copy}>
            <CopyIcon /> <span>Copy number</span>
          </button>
        </div>
      )}
    </div>
  )
}
