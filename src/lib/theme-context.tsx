'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

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

/**
 * The inline script in app/layout.tsx has already put data-theme on <html>
 * before first paint (saved choice, else dark). This provider just reads it
 * back and owns the toggle. Setting the attribute in an effect instead used to
 * paint every page light then flip it.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    if (current === 'dark' || current === 'light') {
      setTheme(current)
      return
    }
    // Script didn't run (very old browser): fall back to the dark default
    document.documentElement.setAttribute('data-theme', 'dark')
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
