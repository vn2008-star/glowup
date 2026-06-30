'use client'

import { useState, useEffect } from 'react'
import { useLocale } from 'next-intl'
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/config'

const WELCOME_KEY = 'glowup_welcome_shown'

export function WelcomeLanguageModal() {
  const currentLocale = useLocale() as Locale
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Only show once per browser
    if (!localStorage.getItem(WELCOME_KEY)) {
      setShow(true)
    }
  }, [])

  function selectLanguage(locale: Locale) {
    localStorage.setItem(WELCOME_KEY, '1')
    if (locale !== currentLocale) {
      document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`
      window.location.reload()
    } else {
      setShow(false)
    }
  }

  function dismiss() {
    localStorage.setItem(WELCOME_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          animation: 'welcomeFadeIn 0.3s ease-out',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '420px',
        maxWidth: 'calc(100vw - 32px)',
        background: 'var(--bg-card)',
        border: '1px solid rgba(195, 126, 218, 0.3)',
        borderRadius: '20px',
        padding: '32px',
        zIndex: 10001,
        boxShadow: '0 16px 64px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(195, 126, 218, 0.1)',
        animation: 'welcomeSlideIn 0.4s ease-out',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🌍</div>
        <h2 style={{
          fontSize: '20px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '4px',
        }}>
          Welcome to GlowUp!
        </h2>
        <p style={{
          fontSize: '14px',
          color: 'var(--text-secondary)',
          marginBottom: '4px',
        }}>
          Chào mừng bạn · 欢迎 · 환영합니다 · Bienvenido
        </p>
        <p style={{
          fontSize: '13px',
          color: 'var(--text-tertiary)',
          marginBottom: '20px',
        }}>
          Choose your preferred language:
        </p>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginBottom: '20px',
        }}>
          {locales.map((locale) => (
            <button
              key={locale}
              onClick={() => selectLanguage(locale)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                border: currentLocale === locale
                  ? '2px solid var(--color-primary)'
                  : '1px solid var(--border-default)',
                background: currentLocale === locale
                  ? 'rgba(195, 126, 218, 0.12)'
                  : 'transparent',
                color: 'var(--text-primary)',
                fontWeight: currentLocale === locale ? 700 : 500,
                fontSize: '15px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                width: '100%',
              }}
              onMouseOver={(e) => {
                if (locale !== currentLocale) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(195, 126, 218, 0.06)';
                }
              }}
              onMouseOut={(e) => {
                if (locale !== currentLocale) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: '24px' }}>{localeFlags[locale]}</span>
              <span>{localeNames[locale]}</span>
              {locale === currentLocale && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={dismiss}
          style={{
            padding: '10px 24px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #c37eda, #9b59b6)',
            border: 'none',
            color: '#fff',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            width: '100%',
          }}
        >
          Continue
        </button>
      </div>

      <style jsx global>{`
        @keyframes welcomeFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes welcomeSlideIn {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </>
  )
}
