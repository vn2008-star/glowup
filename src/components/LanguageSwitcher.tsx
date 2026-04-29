'use client'

import { useState, useRef, useEffect } from 'react'
import { useLocale } from 'next-intl'
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/config'

export function LanguageSwitcher({ variant = 'header' }: { variant?: 'header' | 'sidebar' }) {
  const currentLocale = useLocale() as Locale
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function switchLocale(locale: Locale) {
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`
    setOpen(false)
    window.location.reload()
  }

  const isSidebar = variant === 'sidebar'

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: isSidebar ? '8px 12px' : '6px 12px',
          background: 'transparent',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
          width: isSidebar ? '100%' : 'auto',
          justifyContent: isSidebar ? 'flex-start' : 'center',
        }}
        title="Change language"
      >
        <span style={{ fontSize: '16px' }}>{localeFlags[currentLocale]}</span>
        <span>{isSidebar ? localeNames[currentLocale] : currentLocale.toUpperCase()}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: isSidebar ? '100%' : 'auto',
            top: isSidebar ? 'auto' : '100%',
            left: 0,
            right: isSidebar ? 0 : 'auto',
            marginTop: isSidebar ? 0 : '4px',
            marginBottom: isSidebar ? '4px' : 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '4px',
            zIndex: 999,
            minWidth: '160px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          {locales.map((locale) => (
            <button
              key={locale}
              onClick={() => switchLocale(locale)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '8px 12px',
                background: locale === currentLocale ? 'var(--color-primary-200)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: locale === currentLocale ? 'var(--color-primary)' : 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                fontWeight: locale === currentLocale ? 600 : 400,
                transition: 'background var(--transition-fast)',
              }}
            >
              <span style={{ fontSize: '16px' }}>{localeFlags[locale]}</span>
              <span>{localeNames[locale]}</span>
              {locale === currentLocale && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
