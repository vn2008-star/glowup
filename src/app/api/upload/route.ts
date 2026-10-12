import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { authenticate, isAuthFailure } from '@/lib/api-auth'

// Where the dashboard puts images (see uploadImage() callers).
const UPLOAD_FOLDERS = new Set(['services', 'logos', 'gallery', 'qr', 'clients', 'staff', 'uploads'])
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
}
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// Upload file to Supabase Storage
export async function POST(request: Request) {
  const caller = await authenticate()
  if (isAuthFailure(caller)) return caller.response

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const formData = await request.formData()
  const file = formData.get('file')
  const folder = String(formData.get('folder') || 'services')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // The bucket is public and served from the storage origin. With the
  // caller choosing the folder and extension, an .html or .svg upload was a
  // stored script on that origin; with no cap, a 500 MB file was accepted.
  if (!UPLOAD_FOLDERS.has(folder)) {
    return NextResponse.json({ error: 'Unknown upload folder' }, { status: 400 })
  }
  const ext = IMAGE_TYPES[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP or GIF images can be uploaded' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Image is too large (10 MB max)' }, { status: 400 })
  }

  // Create unique filename (extension from the MIME type, not the name)
  const fileName = `${caller.tenantId}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

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
