import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Keep-Warm Endpoint ───
// Pinged every 5 minutes by Vercel Cron to prevent cold starts.
// Makes a minimal Supabase query to keep the DB connection pool warm too.

export async function GET() {
  const start = Date.now()

  // Lightweight query to keep Supabase connection warm
  try {
    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await svc.from('tenants').select('id', { count: 'exact', head: true }).limit(1)
  } catch {
    // Non-critical — the main goal is keeping the function warm
  }

  return NextResponse.json({
    status: 'warm',
    ms: Date.now() - start,
    ts: new Date().toISOString(),
  })
}
