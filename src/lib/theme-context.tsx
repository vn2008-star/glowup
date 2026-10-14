'use client'
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

const STORAGE_KEY = 'glowup_theme'

function isTheme(v: unknown): v is Theme {
  return v === 'dark' || v === 'light'
}

function readSaved(): Theme | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return isTheme(s) ? s : null
  } catch { return null }
}

/**
 * The inline script in app/layout.tsx has already put data-theme on <html>
 * before first paint (saved choice, else dark). This provider reads it back,
 * owns the toggle, and keeps the choice on the signed-in user's account
 * (auth user_metadata.theme) so it follows them across devices, browsers, the
 * home-screen app and both domains. localStorage is only the per-browser cache
 * that lets the script paint the right theme before React loads.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  // Bumped on every toggle; an account read that started before the latest
  // click is discarded instead of overwriting what the user just picked.
  const pickSeq = useRef(0)
  // Saves still in flight. While > 0 the account (or a refreshed token) may
  // still hold the old value, so account-driven changes are ignored.
  const saving = useRef(0)

  const apply = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
    setTheme(next)
  }, [])

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    if (isTheme(current)) setTheme(current)
    // Script didn't run (very old browser): fall back to the dark default
    else document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  // Account sync. getUser() hits the Auth server, unlike the JWT's copy of
  // user_metadata, which can be up to an hour stale after a change on another
  // device. It runs in the background once per page load, never blocking paint.
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function syncFromAccount() {
      const seq = pickSeq.current
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return // signed out (e.g. public booking pages): local only
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user || seq !== pickSeq.current || saving.current > 0) return
      const accountTheme = user.user_metadata?.theme
      if (isTheme(accountTheme)) {
        if (accountTheme !== document.documentElement.getAttribute('data-theme')) apply(accountTheme)
      } else {
        // Nothing on the account yet: adopt this browser's earlier explicit pick
        const local = readSaved()
        if (local) supabase.auth.updateUser({ data: { theme: local } }).catch(() => {})
      }
    }

    syncFromAccount().catch(() => {})

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (saving.current > 0) return
      if (event === 'SIGNED_IN') {
        // Also fires when a tab regains focus with a cached session, so re-fetch
        // rather than trusting the session's possibly stale metadata.
        setTimeout(() => { syncFromAccount().catch(() => {}) }, 0)
      } else if (event === 'TOKEN_REFRESHED') {
        // Picks up a change made on another device within the hour
        const t = session?.user?.user_metadata?.theme
        if (isTheme(t) && t !== document.documentElement.getAttribute('data-theme')) apply(t)
      }
    })

    return () => { cancelled = true; subscription.unsubscribe() }
  }, [apply])

  const toggleTheme = useCallback(() => {
    pickSeq.current++
    const next: Theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
    apply(next)
    const supabase = createClient()
    saving.current++
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) await supabase.auth.updateUser({ data: { theme: next } })
    }).catch(() => {}).finally(() => { saving.current-- })
  }, [apply])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
