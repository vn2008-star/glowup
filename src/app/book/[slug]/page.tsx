// Server page: fetches the booking payload during the server render so the
// first paint is the service list, not a spinner followed by a fetch. The
// payload comes from the same GET handler the client refetches from at the
// date/time step, so the two can't drift. React.cache shares the one call
// between generateMetadata and the page.

import { cache } from 'react'
import type { Metadata } from 'next'
import BookingClient, { type BookingPayload } from './BookingClient'
import { GET as bookingGet } from '@/app/api/public-booking/route'

export const dynamic = 'force-dynamic'

const loadBooking = cache(async (slug: string): Promise<{ data: BookingPayload | null; error: string | null }> => {
  try {
    const res = await bookingGet(new Request(`http://localhost/api/public-booking?slug=${encodeURIComponent(slug)}`))
    if (!res.ok) return { data: null, error: 'Business not found' }
    return { data: (await res.json()) as BookingPayload, error: null }
  } catch (err) {
    console.error('[book] server prefetch failed', err)
    // The client falls back to its own fetch when no payload is given.
    return { data: null, error: null }
  }
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { data } = await loadBooking(slug)
  if (!data?.business) return { title: 'Book an appointment' }
  const name = data.business.name
  return {
    title: `Book with ${name}`,
    description: `Book your appointment online with ${name}${data.business.address ? ` · ${data.business.address}` : ''}.`,
    openGraph: {
      title: `Book with ${name}`,
      description: `Book your appointment online with ${name}.`,
      ...(data.business.logo_url ? { images: [{ url: data.business.logo_url }] } : {}),
    },
  }
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data, error } = await loadBooking(slug)
  return <BookingClient slug={slug} initialData={data} initialError={error} />
}
