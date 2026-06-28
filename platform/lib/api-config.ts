/**
 * Resolve API base URL for browser vs server.
 *
 * Local dev: NEXT_PUBLIC_API_URL or http://localhost:8000
 * Production: same-origin /api/backend proxy (BACKEND_URL on frontend host at runtime)
 *              OR direct NEXT_PUBLIC_API_URL when set to a live HTTPS backend
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

    if (envUrl && (isLocal || !envUrl.includes('localhost'))) {
      return { origin: envUrl, apiPrefix: `${envUrl}/api` }
    }

    if (!isLocal) {
      return { origin: window.location.origin, apiPrefix: '/api/backend' }
    }

    const local = envUrl || 'http://localhost:8000'
    return { origin: local, apiPrefix: `${local}/api` }
  }

  const backend = envUrl || 'http://localhost:8000'
  return { origin: backend, apiPrefix: `${backend}/api` }
}

export function getBackendUrlForProxy(): string {
  return stripTrailingSlash(
    process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8000',
  )
}
