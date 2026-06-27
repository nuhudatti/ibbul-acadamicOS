/** Resize and compress images for localStorage branding (max 500 KB). */

export interface OptimizeImageOptions {
  maxWidth?: number
  maxHeight?: number
  maxBytes?: number
  mime?: 'image/jpeg' | 'image/webp'
  quality?: number
}

const DEFAULTS: Required<OptimizeImageOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  maxBytes: 512_000,
  mime: 'image/jpeg',
  quality: 0.82,
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image.'))
    img.src = src
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read image.'))
    reader.readAsDataURL(file)
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image.'))),
      mime,
      quality
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read compressed image.'))
    reader.readAsDataURL(blob)
  })
}

/** Fit within max dimensions preserving aspect ratio (Full HD default). */
function fitDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1)
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}

export async function optimizeImageFile(
  file: File,
  options: OptimizeImageOptions = {}
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPG, or WebP).')
  }

  const opts = { ...DEFAULTS, ...options }
  const dataUrl = await readFileAsDataUrl(file)
  const img = await loadImage(dataUrl)
  const { width, height } = fitDimensions(img.width, img.height, opts.maxWidth, opts.maxHeight)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image.')

  ctx.drawImage(img, 0, 0, width, height)

  let quality = opts.quality
  let blob = await canvasToBlob(canvas, opts.mime, quality)

  while (blob.size > opts.maxBytes && quality > 0.45) {
    quality -= 0.08
    blob = await canvasToBlob(canvas, opts.mime, quality)
  }

  if (blob.size > opts.maxBytes) {
    throw new Error(
      'Image is still too large after compression. Try a smaller photo or crop (max 500 KB).'
    )
  }

  return blobToDataUrl(blob)
}

/** Logo — smaller cap, PNG-friendly via JPEG for size. */
export async function optimizeLogoFile(file: File): Promise<string> {
  return optimizeImageFile(file, { maxWidth: 512, maxHeight: 512, quality: 0.88 })
}

/** Login / banner — Full HD, compressed to 500 KB. */
export async function optimizeBackgroundFile(file: File): Promise<string> {
  return optimizeImageFile(file, { maxWidth: 1920, maxHeight: 1080, quality: 0.82 })
}
