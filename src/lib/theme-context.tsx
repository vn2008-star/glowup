'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

/**
 * The inline script in app/layout.tsx has already put data-theme on <html>
 * before first paint (saved choice, else the OS preference). This provider
 * just reads it back and owns the toggle. It used to default to dark and set
 * the attribute in an effect, which painted every page light then flipped it.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    if (current === 'dark' || current === 'light') {
      setTheme(current)
      return
    }
    // Script didn't run (very old browser): fall back to the OS preference
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    const initial: Theme = prefersDark ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', initial)
    setTheme(initial)
  }, [])

  // Follow the OS until the user picks explicitly
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => {
      try { if (localStorage.getItem('glowup_theme')) return } catch { /* ignore */ }
      const next: Theme = e.matches ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', next)
      setTheme(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      try { localStorage.setItem('glowup_theme', next) } catch { /* private mode */ }
      document.documentElement.setAttribute('data-theme', next)
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
