'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import styles from './page.module.css'
import { GlowUpLogo } from '@/components/GlowUpLogo'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useTheme } from '@/lib/theme-context'

const LogoIcon = () => <GlowUpLogo size={28} />;

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
);
const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
);

export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const t = useTranslations('common')

  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        {/* Left side: logo + theme toggle */}
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.logo}>
            <LogoIcon /> <span>GlowUp</span>
          </Link>
          <button onClick={toggleTheme} className={styles.themeToggleBtn} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            <span>{theme === 'light' ? t('dark') : t('light')}</span>
          </button>
        </div>

        {/* Desktop nav */}
        <nav className={styles.nav}>
          <a href="#features">{t('features')}</a>
          <a href="#pricing">{t('pricing')}</a>
          <Link href="/refer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>🎁 Refer & Earn</Link>
          <LanguageSwitcher variant="header" />
          <Link href="/auth/login">{t('signIn')}</Link>
          <Link href="/auth/signup" className="btn btn-sm btn-primary">{t('getStarted')}</Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          className={styles.mobileMenuBtn}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <nav className={styles.mobileNav} onClick={() => setMenuOpen(false)}>
          <a href="#features">{t('features')}</a>
          <a href="#pricing">{t('pricing')}</a>
          <Link href="/refer">🎁 Refer & Earn</Link>
          <LanguageSwitcher variant="header" />
          <Link href="/auth/login">{t('signIn')}</Link>
          <Link href="/auth/signup" className="btn btn-sm btn-primary" style={{ width: '100%', justifyContent: 'center' }}>{t('getStarted')}</Link>
        </nav>
      )}
    </header>
  )
}
