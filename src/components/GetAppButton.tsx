'use client'

// ─── Get the app ───
// GlowUp ships as a PWA (manifest.json + sw.js), so "the app" is the site
// installed to the home screen. Chrome/Edge/Android fire beforeinstallprompt
// and we can show the native install sheet; Safari never does, so iPhone and
// desktop get instructions plus a QR code that opens GlowUp on the phone.
//
// The event fires once, early — often before this component mounts — so the
// root layout catches it into window.__glowupInstallPrompt.

import { useEffect, useState, useSyncExternalStore } from 'react'
import QRCode from 'qrcode'
import { Dialog } from '@/components/ui/Dialog'
import styles from './GetAppButton.module.css'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
declare global {
  interface Window { __glowupInstallPrompt?: InstallPromptEvent | null }
}

const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
)

// Running standalone (launched from the home screen) — read as an external
// store so the server render and hydration agree (false), then the client
// corrects it without a setState-in-effect.
function subscribeStandalone(cb: () => void) {
  const mq = window.matchMedia('(display-mode: standalone)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
function getStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function GetAppButton({ onOpen }: { onOpen?: () => void }) {
  const standalone = useSyncExternalStore(subscribeStandalone, getStandalone, () => false)
  const [justInstalled, setJustInstalled] = useState(false)
  const installed = standalone || justInstalled
  const [dialogOpen, setDialogOpen] = useState(false)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    const onInstalled = () => { setJustInstalled(true); window.__glowupInstallPrompt = null }
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  useEffect(() => {
    if (!dialogOpen || qr) return
    QRCode.toDataURL(`${window.location.origin}/dashboard`, { width: 360, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => {})
  }, [dialogOpen, qr])

  // Already running as the installed app — nothing to get.
  if (installed) return null

  async function handleClick() {
    onOpen?.()
    const evt = window.__glowupInstallPrompt
    if (evt) {
      window.__glowupInstallPrompt = null // single-use
      await evt.prompt()
      const { outcome } = await evt.userChoice
      if (outcome === 'accepted') setJustInstalled(true)
      return
    }
    setDialogOpen(true)
  }

  return (
    <>
      <button type="button" className={styles.button} onClick={handleClick}>
        <PhoneIcon /> <span>Get the app</span>
      </button>
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Get the GlowUp app"
        description="Put GlowUp on your home screen — it opens full-screen like any other app."
        size="sm"
        footer={<button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(false)}>Done</button>}
      >
        <div className={styles.body}>
          <div className={styles.qrWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, nothing to optimize */}
            {qr ? <img src={qr} alt="QR code that opens GlowUp" className={styles.qr} /> : <div className={styles.qr} />}
            <p className={styles.qrCaption}>On a computer? Scan with your phone&apos;s camera to open GlowUp there.</p>
          </div>
          <div className={styles.steps}>
            <h4>iPhone / iPad (Safari)</h4>
            <ol>
              <li>Tap the <strong>Share</strong> button</li>
              <li>Choose <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong></li>
            </ol>
            <h4>Android (Chrome)</h4>
            <ol>
              <li>Tap the <strong>⋮</strong> menu</li>
              <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong></li>
            </ol>
          </div>
        </div>
      </Dialog>
    </>
  )
}
