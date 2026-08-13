import { resizeImageFile, resizePresetFor } from '@/lib/resize-image'

// Client-side helper to call the unified data API
export async function queryData<T = unknown>(action: string, payload?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    return { data: null, error: err.error || `HTTP ${res.status}` }
  }

  return res.json()
}

// Semantic alias for write operations (same underlying POST)
export const mutateData = queryData;

// Upload an image to Supabase Storage via /api/upload and get back a public URL.
// Use this instead of FileReader/readAsDataURL — storing base64 data URIs in the
// database bloats rows and slows every query that selects the column.
//
// The file is downscaled in the browser first (see lib/resize-image), sized to
// what each folder actually displays — a logo rendered at 56px in an email
// shouldn't ship 600KB to every recipient. Falls back to the original file if
// the image can't be re-encoded.
export async function uploadImage(
  file: File,
  folder = 'uploads'
): Promise<{ url: string | null; error: string | null }> {
  const resized = await resizeImageFile(file, resizePresetFor(folder));
  const fd = new FormData();
  fd.append('file', resized);
  fd.append('folder', folder);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    return { url: null, error: err.error || `HTTP ${res.status}` };
  }
  const { url } = await res.json();
  return { url, error: null };
}
