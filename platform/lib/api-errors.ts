/**
 * Normalize API error payloads into safe strings for JSX and toasts.
 * Prevents React error #31 when DRF returns { code, message } objects.
 */
import axios from 'axios'

function formatErrorDetail(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const msg = formatErrorDetail(item)
      if (msg) return msg
    }
    return null
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim()
    }
    if (typeof record.detail === 'string' && record.detail.trim()) {
      return record.detail.trim()
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim()
    }
    if (record.error != null) {
      const nested = formatErrorDetail(record.error)
      if (nested) return nested
    }
    for (const nested of Object.values(record)) {
      const msg = formatErrorDetail(nested)
      if (msg) return msg
    }
  }
  return null
}

/** Turn any API error body (or field value) into a display string. */
export function formatApiErrorValue(value: unknown, fallback = 'Something went wrong.'): string {
  return formatErrorDetail(value) ?? fallback
}

/** Extract a readable message from a failed axios/API call. */
export function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED') {
      return 'Upload timed out. For large files, set NEXT_PUBLIC_API_URL on Vercel to your Render backend URL.'
    }
    if (!err.response) {
      return 'Could not reach the server. For file uploads, set NEXT_PUBLIC_API_URL on Vercel to your Render backend URL.'
    }
    const data = err.response.data
    if (err.response.status === 502 && data && typeof data === 'object') {
      const record = data as Record<string, unknown>
      if (typeof record.error === 'string' && record.error.trim()) return record.error
      return 'Backend unreachable. Set BACKEND_URL on your frontend host and redeploy.'
    }
    const msg = formatErrorDetail(data)
    if (msg) return msg
    if (err.response.status === 403) return 'You do not have permission for this action.'
    if (err.response.status === 404) {
      return 'Service not found. The API may be misconfigured — contact ICT support.'
    }
    if (err.response.status === 500) {
      return 'Server error — please try again. If it persists, contact ICT support.'
    }
  }
  return fallback
}

/** Parse common Django/DRF login and form error shapes. */
export function extractFormError(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const record = data as Record<string, unknown>

  const direct =
    formatErrorDetail(record.non_field_errors)
    ?? formatErrorDetail(record.detail)
    ?? formatErrorDetail(record.error)
    ?? formatErrorDetail(record.message)
  if (direct) return direct

  const nested = record.errors
  if (nested && typeof nested === 'object') {
    const nestedRecord = nested as Record<string, unknown>
    const nestedMsg =
      formatErrorDetail(nestedRecord.non_field_errors)
      ?? formatErrorDetail(nestedRecord.username)
      ?? formatErrorDetail(nestedRecord.password)
    if (nestedMsg) return nestedMsg
  }

  const fieldMsg =
    formatErrorDetail(record.username)
    ?? formatErrorDetail(record.password)
    ?? formatErrorDetail(record.current_password)
    ?? formatErrorDetail(record.new_password)
  if (fieldMsg) return fieldMsg

  return fallback
}

/** Safe string for rendering user-facing text fields from the API. */
export function safeDisplayText(value: unknown, fallback = ''): string {
  if (value == null) return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const formatted = formatErrorDetail(value)
  return formatted ?? fallback
}
