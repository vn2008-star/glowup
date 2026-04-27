import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Use service role to bypass RLS for tenant lookup
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: staffRecord, error } = await serviceSupabase
    .from('staff')
    .select('*, tenants(*)')
    .eq('user_id', user.id)
    .single()

  if (error || !staffRecord) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
  }

  return NextResponse.json({ staff: staffRecord })
}
