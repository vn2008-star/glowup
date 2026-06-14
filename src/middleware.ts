import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match only paths that need session handling:
     * - /dashboard/* (protected, needs auth redirect)
     * - /auth/* (needs redirect-if-logged-in)
     *
     * Excluded (handled separately or don't need auth):
     * - /api/* (API routes handle their own auth)
     * - /book/* (public booking pages)
     * - /checkin/* (public check-in)
     * - / (landing page)
     * - _next/static, _next/image, favicon, images
     */
    '/dashboard/:path*',
    '/auth/:path*',
  ],
}
