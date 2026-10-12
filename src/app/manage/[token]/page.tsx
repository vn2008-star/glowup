// Server page: loads the appointment during the server render so the client
// sees their booking on first paint instead of a spinner. Same GET handler
// the client would have called, so nothing drifts.

import type { Metadata } from 'next'
import ManageClient, { type ManagePayload } from './ManageClient'
import { GET as manageGet } from '@/app/api/manage-appointment/route'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Manage your appointment', robots: { index: false, follow: false } }

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let initialData: ManagePayload | null = null
  let initialError: string | null = null
  try {
    const res = await manageGet(new Request(`http://localhost/api/manage-appointment?token=${encodeURIComponent(token)}`))
    if (res.ok) initialData = (await res.json()) as ManagePayload
    else initialError = 'Appointment not found or link has expired.'
  } catch (err) {
    console.error('[manage] server prefetch failed', err)
    // The client falls back to its own fetch when no payload is given.
  }
  return <ManageClient token={token} initialData={initialData} initialError={initialError} />
}
