'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { GlowUpLogo } from '@/components/GlowUpLogo'
import styles from '../login/auth.module.css'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('auth')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    // Check if user arrived via a valid reset link (has active session)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setHasSession(true)
      }
    })

    // Listen for the PASSWORD_RECOVERY event from the hash fragment
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setHasSession(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError(t('passwordTooShort'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('passwordsMismatch'))
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
    }
  }

  // If no valid session from reset link, show expired message
  if (!hasSession) {
    return (
      <div className={styles.authPage}>
        <div className={styles.authCard}>
          <div className={styles.authHeader}>
            <Link href="/" className={styles.logoLink}>
              <GlowUpLogo size={36} />
              <span className={styles.logoText}>GlowUp</span>
            </Link>
            <h1 className={styles.authTitle}>{t('resetPassword')}</h1>
          </div>
          <div className={styles.errorMessage}>
            {t('resetLinkExpired')}
          </div>
          <p className={styles.authFooter}>
            <Link href="/auth/forgot-password">{t('requestNewLink')}</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authHeader}>
          <Link href="/" className={styles.logoLink}>
            <GlowUpLogo size={36} />
            <span className={styles.logoText}>GlowUp</span>
          </Link>
          <h1 className={styles.authTitle}>{t('setNewPassword')}</h1>
          <p className={styles.authSubtitle}>{t('setNewPasswordSubtitle')}</p>
        </div>

        {success ? (
          <div className={styles.successMessage}>
            {t('passwordUpdated')}
          </div>
        ) : (
          <form onSubmit={handleSetPassword} className={styles.authForm}>
            {error && <div className={styles.errorMessage}>{error}</div>}

            <div className={styles.formGroup}>
              <label htmlFor="password">{t('newPassword')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                minLength={6}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword">{t('confirmNewPassword')}</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? t('updatingPassword') : t('updatePassword')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
