import { resolveApiBase } from '@/lib/api-config'
import { safeStr, safeTrim } from '@/lib/safe-string'

export interface LessonMediaUrls {
  viewUrl: string
  downloadUrl: string
  filename: string
  external: boolean
}

/** Build a full browser URL for a backend-relative media path. */
export function buildBackendMediaUrl(relativePath: unknown): string {
  const path = safeTrim(relativePath)
  if (!path) return ''
  const { apiPrefix } = resolveApiBase()
  const clean = path.startsWith('/') ? path.slice(1) : path
  return `${apiPrefix}/${clean}`
}

/** External links only — uploaded files must use useLessonMediaAccess. */
export function resolveLessonExternalUrl(lesson: {
  external_url?: string | null
  file_key?: string | null
}): string {
  const ext = safeTrim(lesson.external_url)
  const key = safeTrim(lesson.file_key)
  if (ext && !key) return ext
  return ext || ''
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const m = Math.floor(safeSeconds / 60)
  const s = safeSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
