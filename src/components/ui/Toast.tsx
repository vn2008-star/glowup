'use client'

// ─── Toasts ───
// Replaces the 80 native alert()/confirm() calls one page at a time. A toast
// is non-blocking, themed, readable by screen readers, and goes away on its
// own; alert() froze the page, looked like a browser error, and on the public
// booking page told clients "localhost says".

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import styles from './Toast.module.css'

type Kind = 'success' | 'error' | 'info'
interface ToastItem { id: number; kind: Kind; text: string; leaving?: boolean }

interface ToastApi {
  success: (text: string) => void
  error: (text: string) => void
  info: (text: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** `const toast = useToast(); toast.error('Could not save')` */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  // Outside the provider (tests, a stray component) fall back to the console
  // rather than crashing the page.
  return ctx || { success: (t) => console.log(t), error: (t) => console.error(t), info: (t) => console.log(t) }
}

const DURATION: Record<Kind, number> = { success: 3500, info: 4500, error: 7000 }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 180)
    const tm = timers.current.get(id)
    if (tm) { clearTimeout(tm); timers.current.delete(id) }
  }, [])

  const push = useCallback((kind: Kind, text: string) => {
    const id = nextId.current++
    setItems((prev) => [...prev.slice(-3), { id, kind, text }])
    timers.current.set(id, setTimeout(() => dismiss(id), DURATION[kind]))
  }, [dismiss])

  useEffect(() => {
    const t = timers.current
    return () => { t.forEach(clearTimeout); t.clear() }
  }, [])

  const api = useMemo<ToastApi>(() => ({
    success: (text) => push('success', text),
    error: (text) => push('error', text),
    info: (text) => push('info', text),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`${styles.toast} ${styles[t.kind]} ${t.leaving ? styles.leaving : ''}`}
          >
            <span className={styles.icon} aria-hidden="true">
              {t.kind === 'success' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : t.kind === 'error' ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
              )}
            </span>
            <span className={styles.text}>{t.text}</span>
            <button type="button" className={styles.close} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
