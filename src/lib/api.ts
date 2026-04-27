// Client-side helper to call the unified data API
export async function queryData<T = unknown>(action: string, payload?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    return { data: null, error: err.error || `HTTP ${res.status}` }
  }

  return res.json()
}
