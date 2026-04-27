'use client'

import { createClient } from '@/lib/supabase/client'
import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import type { Tenant, Staff } from '@/lib/types'

interface TenantContextType {
  tenant: Tenant | null
  currentStaff: Staff | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  currentStaff: null,
  loading: true,
  error: null,
  refetch: async () => {},
})

export function useTenant() {
  return useContext(TenantContext)
}

const CACHE_KEY = 'glowup_tenant_cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCachedTenant(): { tenant: Tenant; staff: Staff } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.ts > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY)
      return null
    }
    return { tenant: parsed.tenant, staff: parsed.staff }
  } catch {
    return null
  }
}

function setCachedTenant(tenant: Tenant, staff: Staff) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ tenant, staff, ts: Date.now() }))
  } catch { /* quota exceeded — ignore */ }
}

export function clearTenantCache() {
  try { sessionStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const setupFired = useRef(false)

  async function fetchTenant(skipCache = false) {
    setError(null)

    // 1. Try sessionStorage cache first for instant rendering
    if (!skipCache) {
      const cached = getCachedTenant()
      if (cached) {
        setTenant(cached.tenant)
        setCurrentStaff(cached.staff)
        setLoading(false)
        // Revalidate in the background (stale-while-revalidate pattern)
        fetchFromServer(false)
        return
      }
    }

    setLoading(true)
    await fetchFromServer(true)
  }

  async function fetchFromServer(updateLoading: boolean) {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        if (updateLoading) setLoading(false)
        return
      }

      // Fire setup-tenant once per session, non-blocking
      if (!setupFired.current) {
        setupFired.current = true
        // Don't await — let it run in the background
        fetch('/api/setup-tenant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            email: user.email,
            businessName: user.user_metadata?.business_name || user.user_metadata?.full_name || user.email?.split('@')[0],
            ownerName: user.user_metadata?.full_name || user.email?.split('@')[0],
          }),
        }).catch(() => {}) // swallow errors — setup is idempotent
      }

      // Fetch tenant data via server API (uses service role to bypass RLS)
      const res = await fetch('/api/get-tenant')
      if (!res.ok) {
        if (updateLoading) {
          setError('No business found. Please complete signup.')
          setLoading(false)
        }
        return
      }

      const { staff: staffRecord } = await res.json()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tenantData = (staffRecord as any).tenants as Tenant
      const { tenants: _, ...staffOnly } = staffRecord as Record<string, unknown>

      setTenant(tenantData)
      setCurrentStaff(staffOnly as unknown as Staff)
      setCachedTenant(tenantData, staffOnly as unknown as Staff)
    } catch (err) {
      if (updateLoading) {
        setError(err instanceof Error ? err.message : 'Failed to load business data')
      }
    } finally {
      if (updateLoading) setLoading(false)
    }
  }

  useEffect(() => {
    fetchTenant()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <TenantContext.Provider value={{ tenant, currentStaff, loading, error, refetch: () => fetchTenant(true) }}>
      {children}
    </TenantContext.Provider>
  )
}
