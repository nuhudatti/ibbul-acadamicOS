/**

 * Resolve API base URL for browser vs server.

 *

 * Production (Vercel/Render): ALWAYS use same-origin /api/backend proxy — never cross-origin

 * to Render backend (avoids CORS + timeout masking).

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

    // Production browser: same-origin proxy for JSON API (requires BACKEND_URL on Vercel)
    if (!isLocal) {
      return { origin: window.location.origin, apiPrefix: '/api/backend' }
    }

    const local = envUrl || 'http://localhost:8000'
    return { origin: local, apiPrefix: `${local}/api` }
  }

  const backend = envUrl || 'http://localhost:8000'
  return { origin: backend, apiPrefix: `${backend}/api` }
}

/**
 * Multipart uploads (results Excel, lesson video/PDF) must bypass the Vercel proxy —
 * serverless functions reject bodies over ~4.5MB. Uses NEXT_PUBLIC_API_URL when set.
 */
export function resolveMultipartApiPrefix(): string {
  const direct = stripTrailingSlash(
    process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      '',
  )

  if (typeof window !== 'undefined') {
    const isLocal = isLocalHostname(window.location.hostname)
    if (!isLocal && direct) {
      return `${direct}/api`
    }
    if (!isLocal) {
      return '/api/backend'
    }
    return `${direct || 'http://localhost:8000'}/api`
  }

  return `${direct || 'http://localhost:8000'}/api`
}



export function getBackendUrlForProxy(): string {

  return stripTrailingSlash(

    process.env.BACKEND_URL ||

      process.env.NEXT_PUBLIC_API_URL ||

      'http://localhost:8000',

  )

}


