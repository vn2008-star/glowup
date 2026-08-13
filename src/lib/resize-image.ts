// ─── Client-side Image Downscaling ───
// Runs in the browser before an upload leaves the page, so we never store (or
// re-serve) a 600 KB photo for something rendered at 56 px. Uses canvas — no
// dependency, and it also cuts upload time on salon wifi.

export interface ResizeOptions {
  /** Longest edge, in px, of the result. */
  maxDim: number
  /** Never re-encode as JPEG (QR codes must stay lossless). */
  lossless?: boolean
  /** Leave files at or under this size alone. */
  skipUnderBytes?: number
}

/** Per-folder targets. Logos are shown at ~56 px in email, ~180 px in-app. */
const PRESETS: Record<string, ResizeOptions> = {
  logos: { maxDim: 512, skipUnderBytes: 60_000 },
  qr: { maxDim: 800, lossless: true, skipUnderBytes: 120_000 },
  staff: { maxDim: 800, skipUnderBytes: 150_000 },
  clients: { maxDim: 800, skipUnderBytes: 150_000 },
}
const DEFAULT_PRESET: ResizeOptions = { maxDim: 1600, skipUnderBytes: 300_000 }

export function resizePresetFor(folder: string): ResizeOptions {
  return PRESETS[folder] || DEFAULT_PRESET
}

/** True if any pixel is not fully opaque — such an image must stay PNG. */
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, w, h)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true
    }
    return false
  } catch {
    return true  // tainted canvas or similar — assume alpha and keep PNG
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')) }
    img.src = url
  })
}

/**
 * Downscale `file` to fit `maxDim`, re-encoding as JPEG unless the image has
 * transparency (or `lossless` is set), in which case it stays PNG.
 *
 * Always resolves — on any failure it returns the ORIGINAL file, because a
 * slightly heavy logo is much better than an upload that refuses to work.
 */
export async function resizeImageFile(file: File, opts: ResizeOptions): Promise<File> {
  // SVG is already tiny and vector — rasterizing it would make it worse.
  if (file.type === 'image/svg+xml') return file
  if (!file.type.startsWith('image/')) return file

  try {
    const img = await loadImage(file)
    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h) return file

    const scale = Math.min(1, opts.maxDim / Math.max(w, h))
    const alreadySmall = scale === 1 && file.size <= (opts.skipUnderBytes ?? 0)
    if (alreadySmall) return file

    const outW = Math.max(1, Math.round(w * scale))
    const outH = Math.max(1, Math.round(h * scale))

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return file
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, outW, outH)

    const keepPng = opts.lossless || hasTransparency(ctx, outW, outH)
    const type = keepPng ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>(res =>
      canvas.toBlob(b => res(b), type, keepPng ? undefined : 0.85))
    if (!blob) return file

    // Re-encoding can inflate an already-optimised file (e.g. a small PNG
    // exported by a designer). Only take the new one if it actually helps.
    if (blob.size >= file.size) return file

    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.${keepPng ? 'png' : 'jpg'}`, { type, lastModified: Date.now() })
  } catch {
    return file
  }
}
