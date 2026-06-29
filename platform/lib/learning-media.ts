import { resolveApiBase } from '@/lib/api-config'

export interface LessonMediaUrls {
  viewUrl: string
  downloadUrl: string
  filename: string
  external: boolean
}

/** Build a full browser URL for a backend-relative media path. */
export function buildBackendMediaUrl(relativePath: string): string {
  const { apiPrefix } = resolveApiBase()
  const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  return `${apiPrefix}/${path}`
}

/** @deprecated Use useLessonMediaAccess hook — kept for external_url-only lessons. */
export function resolveLessonMediaUrl(lesson: {
  id: number
  file_key?: string
  external_url?: string
}): string {
  const ext = lesson.external_url?.trim()
  if (ext && !lesson.file_key?.trim()) return ext
  if (!lesson.file_key?.trim()) return ext || ''
  return buildBackendMediaUrl(
    `learning/lessons/${lesson.id}/media/file/?disposition=inline`,
  )
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
