/**
 * Resolve API base URL for browser vs server.
 *
 * Production (Vercel): browser always uses same-origin /api/backend proxy.
 * Server-side proxy route uses BACKEND_URL (never exposed to the browser).
 *
 * Local dev: NEXT_PUBLIC_API_URL or http://localhost:8000
 */
import { safeStr } from './safe-string'

function stripTrailingSlash(url: string): string {
  const value = safeStr(url)
  if (!value) return ''
  return value.replace(/\/$/, '')
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function isProductionHost(): boolean {
  if (typeof window !== 'undefined') {
    return !isLocalHostname(window.location.hostname)
  }
  return Boolean(process.env.VERCEL || process.env.BACKEND_URL)
}

export function resolveApiBase(): { origin: string; apiPrefix: string } {
  const envUrl = stripTrailingSlash(process.env.NEXT_PUBLIC_API_URL || '')

  if (typeof window !== 'undefined') {
    const isLocal = isLocalHostname(window.location.hostname)
    if (!isLocal) {
      return { origin: window.location.origin, apiPrefix: '/api/backend' }
    }
    const local = envUrl || 'http://localhost:8000'
    return { origin: local, apiPrefix: `${local}/api` }
  }

  // SSR must match the browser in production to avoid hydration mismatches.
  if (isProductionHost()) {
    return { origin: '', apiPrefix: '/api/backend' }
  }

  const backend = envUrl || 'http://localhost:8000'
  return { origin: backend, apiPrefix: `${backend}/api` }
}

/** Server-only: Django URL for the Next.js /api/backend proxy route. */
export function getBackendUrlForProxy(): string {
  return stripTrailingSlash(process.env.BACKEND_URL || 'http://localhost:8000') || 'http://localhost:8000'
}
