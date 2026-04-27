import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Upload file to Supabase Storage
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

  // Get tenant_id
  const { data: staffRecord } = await svc
    .from('staff')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single()

  if (!staffRecord) {
    return NextResponse.json({ error: 'No tenant' }, { status: 404 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const folder = formData.get('folder') as string || 'services'

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Create unique filename
  const ext = file.name.split('.').pop() || 'jpg'
  const fileName = `${staffRecord.tenant_id}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

  // Upload to Supabase Storage
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await svc.storage
    .from('uploads')
    .upload(fileName, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    // If bucket doesn't exist, try to create it
    if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
      await svc.storage.createBucket('uploads', { public: true })
      const { error: retryError } = await svc.storage
        .from('uploads')
        .upload(fileName, arrayBuffer, {
          contentType: file.type,
          upsert: false,
        })
      if (retryError) {
        return NextResponse.json({ error: retryError.message }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }
  }

  // Get public URL
  const { data: urlData } = svc.storage.from('uploads').getPublicUrl(fileName)

  return NextResponse.json({ url: urlData.publicUrl })
}
