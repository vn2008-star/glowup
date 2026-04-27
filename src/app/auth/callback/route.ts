import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check if this user has a tenant, if not create one
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Use service role to bypass RLS for tenant setup
        const serviceSupabase = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { data: existingStaff } = await serviceSupabase
          .from('staff')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (!existingStaff) {
          // First-time user — create tenant and staff record
          const businessName = user.user_metadata?.business_name || 
                              user.user_metadata?.full_name || 
                              user.email?.split('@')[0] || 
                              'My Salon'
          const slug = businessName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') + 
            '-' + Math.random().toString(36).slice(2, 6)

          const { data: tenant } = await serviceSupabase
            .from('tenants')
            .insert({
              name: businessName,
              slug,
              business_type: 'nail_salon',
              plan: 'free',
            })
            .select('id')
            .single()

          if (tenant) {
            await serviceSupabase
              .from('staff')
              .insert({
                tenant_id: tenant.id,
                user_id: user.id,
                name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Owner',
                role: 'owner',
                email: user.email,
              })
          }
        }
      }

      return NextResponse.redirect(`${origin}${redirect}`)
    }
  }

  // Auth code exchange failed — redirect to login with error
  return NextResponse.redirect(`${origin}/auth/login?error=Could+not+authenticate`)
}
