/**
 * Resolve API base URL for browser vs server.
 *
 * Production (Vercel): browser always uses same-origin /api/backend proxy.
 * Server-side proxy route uses BACKEND_URL (never exposed to the browser).
 *
 * Local dev: NEXT_PUBLIC_API_URL or http://localhost:8000
 */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
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

  const backend = envUrl || 'http://localhost:8000'
  return { origin: backend, apiPrefix: `${backend}/api` }
}

/** Server-only: Django URL for the Next.js /api/backend proxy route. */
export function getBackendUrlForProxy(): string {
  return stripTrailingSlash(process.env.BACKEND_URL || 'http://localhost:8000')
}
