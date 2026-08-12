import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { authenticate, isAuthFailure } from '@/lib/api-auth'

export async function POST(request: Request) {
  // Was: resolve the caller's own staff row directly, ignoring impersonation.
  // Every action below writes to that tenant — so a platform admin in "View As"
  // saw a banner reading "Viewing as: <salon>", opened Settings → Danger Zone,
  // clicked Delete, and scheduled their OWN tenant for deletion instead.
  const caller = await authenticate()
  if (isAuthFailure(caller)) return caller.response

  // authenticate() resolves the impersonated tenant, which fixes the wrong
  // target — but the right target is neither one. An admin should not be able
  // to suspend or delete a customer's salon from inside that customer's
  // dashboard, so refuse and make them exit View As first.
  if (caller.isImpersonating) {
    return NextResponse.json(
      { error: 'Account management is disabled while viewing as another salon. Exit View As first.' },
      { status: 403 }
    )
  }

  if (caller.staffRole !== 'owner') {
    return NextResponse.json({ error: 'Only the account owner can perform this action' }, { status: 403 })
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const tenantId = caller.tenantId
  const { action, confirm_name } = await request.json()

  // ── Disable (Suspend) Account ──
  if (action === 'disable') {
    const { error } = await svc
      .from('tenants')
      .update({ is_active: false })
      .eq('id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, message: 'Account suspended' })
  }

  // ── Enable (Reactivate) Account ──
  if (action === 'enable') {
    const { error } = await svc
      .from('tenants')
      .update({ is_active: true, deleted_at: null, deletion_scheduled_at: null })
      .eq('id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, message: 'Account reactivated' })
  }

  // ── Schedule Deletion (30-day grace period) ──
  if (action === 'delete') {
    // Get tenant name for confirmation
    const { data: tenantData } = await svc
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
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
      .eq('id', tenantId)

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
      .eq('id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, message: 'Deletion cancelled, account reactivated' })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
