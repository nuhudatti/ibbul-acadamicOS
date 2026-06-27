import type { Lesson } from '@/lib/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

/** Resolve uploaded file_key or external URL for lesson media */
export function resolveLessonMediaUrl(lesson: Pick<Lesson, 'file_key' | 'external_url'>): string {
  const key = lesson.file_key?.trim()
  const ext = lesson.external_url?.trim()
  if (key) {
    if (key.startsWith('http://') || key.startsWith('https://')) return key
    const path = key.startsWith('/') ? key.slice(1) : key
    if (path.startsWith('media/')) return `${API_BASE}/${path}`
    return `${API_BASE}/media/${path}`
  }
  return ext || ''
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
