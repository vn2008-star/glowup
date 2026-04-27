'use client'
import { useState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { GlowUpLogo } from '@/components/GlowUpLogo'

const LogoIcon = () => <GlowUpLogo size={28} />;

export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <Link href="/" className={styles.logo}>
          <LogoIcon /> <span>GlowUp</span>
        </Link>

        {/* Desktop nav */}
        <nav className={styles.nav}>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link href="/auth/login">Sign In</Link>
          <Link href="/auth/signup" className="btn btn-sm btn-primary">Get Started</Link>
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
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link href="/auth/login">Sign In</Link>
          <Link href="/auth/signup" className="btn btn-sm btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Get Started</Link>
        </nav>
      )}
    </header>
  )
}
