import type { Lesson } from '@/lib/types'
import { resolveApiBase } from '@/lib/api-config'

/** Resolve uploaded file_key or external URL for lesson media */
export function resolveLessonMediaUrl(lesson: Pick<Lesson, 'file_key' | 'external_url'>): string {
  const key = lesson.file_key?.trim()
  const ext = lesson.external_url?.trim()
  if (key) {
    if (key.startsWith('http://') || key.startsWith('https://')) {
      return cloudinaryStreamUrl(key)
    }
    const { origin: API_BASE } = resolveApiBase()
    const path = key.startsWith('/') ? key.slice(1) : key
    if (path.startsWith('media/')) return `${API_BASE}/${path}`
    return `${API_BASE}/media/${path}`
  }
  return ext || ''
}

/** Prefer Cloudinary streaming delivery (f_auto) over raw file URL when possible. */
function cloudinaryStreamUrl(url: string): string {
  if (!url.includes('res.cloudinary.com') || url.includes('/upload/f_auto')) {
    return url
  }
  return url.replace('/upload/', '/upload/f_auto,q_auto/')
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
