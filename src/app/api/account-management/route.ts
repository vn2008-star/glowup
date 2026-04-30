import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Only owners can manage account
  const { data: staffRecord } = await svc
    .from('staff')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single()

  if (!staffRecord || staffRecord.role !== 'owner') {
    return NextResponse.json({ error: 'Only the account owner can perform this action' }, { status: 403 })
  }

  const { action, confirm_name } = await request.json()

  // ── Disable (Suspend) Account ──
  if (action === 'disable') {
    const { error } = await svc
      .from('tenants')
      .update({ is_active: false })
      .eq('id', staffRecord.tenant_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, message: 'Account suspended' })
  }

  // ── Enable (Reactivate) Account ──
  if (action === 'enable') {
    const { error } = await svc
      .from('tenants')
      .update({ is_active: true, deleted_at: null, deletion_scheduled_at: null })
      .eq('id', staffRecord.tenant_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, message: 'Account reactivated' })
  }

  // ── Schedule Deletion (30-day grace period) ──
  if (action === 'delete') {
    // Get tenant name for confirmation
    const { data: tenantData } = await svc
      .from('tenants')
      .select('name')
      .eq('id', staffRecord.tenant_id)
      .single()

    if (!tenantData) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Require typing the business name to confirm
    if (!confirm_name || confirm_name.trim().toLowerCase() !== tenantData.name.trim().toLowerCase()) {
      return NextResponse.json({ error: 'Business name does not match. Please type your exact business name to confirm deletion.' }, { status: 400 })
    }

    const deletionDate = new Date()
    deletionDate.setDate(deletionDate.getDate() + 30)

    const { error } = await svc
      .from('tenants')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        deletion_scheduled_at: deletionDate.toISOString(),
      })
      .eq('id', staffRecord.tenant_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      message: 'Account scheduled for deletion',
      deletion_date: deletionDate.toISOString(),
    })
  }

  // ── Cancel Scheduled Deletion ──
  if (action === 'cancel-delete') {
    const { error } = await svc
      .from('tenants')
      .update({ is_active: true, deleted_at: null, deletion_scheduled_at: null })
      .eq('id', staffRecord.tenant_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, message: 'Deletion cancelled, account reactivated' })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
