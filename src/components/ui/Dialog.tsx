'use client'

// ─── Dialog ───
// Built on the native <dialog>, which gives Escape, a focus trap, inert
// background and top-layer stacking for free; the 36 hand-rolled modals had
// none of those. Under 640px it becomes a bottom sheet. Scroll lock is in
// globals.css (`body:has(dialog[open])`).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import styles from './Dialog.module.css'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** Secondary line under the title */
  description?: ReactNode
  children: ReactNode
  /** Buttons row; rendered sticky at the bottom */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Keep the dialog open on backdrop click / Escape (e.g. mid-payment) */
  persistent?: boolean
  /** Extra class on the panel */
  className?: string
}

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', persistent = false, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  // Escape (and form method="dialog") fire `cancel`/`close` on the element;
  // keep React state in sync so the parent can't be left thinking it's open.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onCancel = (e: Event) => {
      if (persistent) { e.preventDefault(); return }
      e.preventDefault()
      onCloseRef.current()
    }
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [persistent])

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${styles[size]} ${className || ''}`}
      aria-labelledby={title ? 'dialog-title' : undefined}
      onClick={(e) => {
        // Only the backdrop (the dialog element itself, outside the panel)
        if (!persistent && e.target === e.currentTarget) onCloseRef.current()
      }}
    >
      <div className={styles.panel}>
        {(title || !persistent) && (
          <header className={styles.header}>
            <div className={styles.titles}>
              {title && <h2 id="dialog-title" className={styles.title}>{title}</h2>}
              {description && <p className={styles.description}>{description}</p>}
            </div>
            {!persistent && (
              <button type="button" className={styles.close} onClick={() => onCloseRef.current()} aria-label="Close">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  )
}

/**
 * A yes/no question. Replaces confirm(): same shape (`if (!await ask()) return`)
 * but themed, non-blocking for the rest of the page, and it works inside the
 * artifact/iframe contexts where confirm() returns false immediately.
 */
export interface ConfirmProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, busy, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}

// ─── useConfirm ───
// `if (!(await confirmDialog({ title: 'Delete this client?', danger: true }))) return`
// One ConfirmDialog mounted by the provider serves the whole app, so a page
// needs no state of its own to ask a yes/no question.

export interface ConfirmOptions {
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  // Outside the provider, fall back to the browser dialog rather than crash.
  return fn || (async (opts) => typeof window !== 'undefined' && window.confirm(String(opts.title)))
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)

  const ask = useCallback<ConfirmFn>((opts) => new Promise<boolean>((resolve) => {
    setPending((prev) => {
      prev?.resolve(false) // a second question supersedes the first
      return { opts, resolve }
    })
  }), [])

  const settle = useCallback((value: boolean) => {
    setPending((prev) => { prev?.resolve(value); return null })
  }, [])

  const value = useMemo(() => ask, [ask])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={!!pending}
        title={pending?.opts.title ?? ''}
        description={pending?.opts.description}
        confirmLabel={pending?.opts.confirmLabel}
        cancelLabel={pending?.opts.cancelLabel}
        danger={pending?.opts.danger}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  )
}
