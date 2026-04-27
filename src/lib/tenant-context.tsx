'use client'

import { createClient } from '@/lib/supabase/client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchTenant() {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      // First, try to ensure tenant exists via setup API
      await fetch('/api/setup-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          businessName: user.user_metadata?.business_name || user.user_metadata?.full_name || user.email?.split('@')[0],
          ownerName: user.user_metadata?.full_name || user.email?.split('@')[0],
        }),
      })

      // Fetch tenant data via server API (uses service role to bypass RLS)
      const res = await fetch('/api/get-tenant')
      if (!res.ok) {
        setError('No business found. Please complete signup.')
        setLoading(false)
        return
      }

      const { staff: staffRecord } = await res.json()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tenantData = (staffRecord as any).tenants as Tenant
      const { tenants: _, ...staffOnly } = staffRecord as Record<string, unknown>

      setTenant(tenantData)
      setCurrentStaff(staffOnly as unknown as Staff)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load business data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTenant()
  }, [])

  return (
    <TenantContext.Provider value={{ tenant, currentStaff, loading, error, refetch: fetchTenant }}>
      {children}
    </TenantContext.Provider>
  )
}
