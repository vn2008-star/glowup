// Server page for the client consent form: resolves the token during the
// render so the first paint is the form, and gives the tab a real title.

import type { Metadata } from 'next'
import ConsentClient, { type ConsentPayload } from './ConsentClient'
import { GET as consentGet } from '@/app/api/consent/route'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Consent form', robots: { index: false, follow: false } }

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let initialData: ConsentPayload | null = null
  let initialError: string | null = null
  try {
    const res = await consentGet(new Request(`http://localhost/api/consent?token=${encodeURIComponent(token)}`))
    if (res.ok) initialData = (await res.json()) as ConsentPayload
    else initialError = 'This link is not valid.'
  } catch (err) {
    console.error('[consent] server prefetch failed', err)
  }
  return <ConsentClient token={token} initialData={initialData} initialError={initialError} />
}
