'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { GlowUpLogo } from '@/components/GlowUpLogo'
import styles from '../login/auth.module.css'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const t = useTranslations('auth')

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authHeader}>
          <Link href="/" className={styles.logoLink}>
            <GlowUpLogo size={36} />
            <span className={styles.logoText}>GlowUp</span>
          </Link>
          <h1 className={styles.authTitle}>{t('resetPassword')}</h1>
          <p className={styles.authSubtitle}>{t('resetSubtitle')}</p>
        </div>

        {success ? (
          <div className={styles.successMessage}>
            {t('resetEmailSent')}
          </div>
        ) : (
          <form onSubmit={handleReset} className={styles.authForm}>
            {error && <div className={styles.errorMessage}>{error}</div>}

            <div className={styles.formGroup}>
              <label htmlFor="email">{t('email')}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yoursalon.com"
                required
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? t('sendingReset') : t('sendResetLink')}
            </button>
          </form>
        )}

        <p className={styles.authFooter}>
          <Link href="/auth/login">{t('backToLogin')}</Link>
        </p>
      </div>
    </div>
  )
}
