/**
 * Same-origin proxy to Django backend — avoids CORS and wrong localhost URLs in production.
 * Set BACKEND_URL on the frontend host, e.g. https://your-api.onrender.com
 */
import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrlForProxy } from '@/lib/api-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const FORWARD_HEADERS = [
  'authorization',
  'content-type',
  'accept',
  'accept-language',
  'cache-control',
]

const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'content-length',
  'cache-control',
  'location',
  'accept-ranges',
]

async function proxyRequest(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const backend = getBackendUrlForProxy()
  const path = pathSegments.join('/')
  const search = req.nextUrl.search
  // Django expects trailing slashes (APPEND_SLASH); POST redirects break auth.
  const djangoPath = path.endsWith('/') ? path : `${path}/`
  const target = `${backend}/api/${djangoPath}${search}`

  const headers = new Headers()
  for (const name of FORWARD_HEADERS) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }

  let body: ArrayBuffer | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer()
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
    })

    const contentType = upstream.headers.get('content-type') || ''
    const responseHeaders = new Headers()
    for (const name of FORWARD_RESPONSE_HEADERS) {
      if (name === 'content-length') continue
      const value = upstream.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }

    // Ensure JSON responses are parsed objects in the browser (not raw strings).
    if (contentType.includes('application/json')) {
      const text = await upstream.text()
      try {
        return NextResponse.json(JSON.parse(text) as unknown, {
          status: upstream.status,
          headers: responseHeaders,
        })
      } catch {
        if (contentType) responseHeaders.set('content-type', contentType)
        return new NextResponse(text, {
          status: upstream.status,
          headers: responseHeaders,
        })
      }
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backend unreachable'
    return NextResponse.json(
      {
        error: `Backend unreachable. Set BACKEND_URL on the frontend host to your Django URL. (${message})`,
      },
      { status: 502 },
    )
  }
}

type RouteContext = { params: Promise<{ path: string[] }> }

async function handler(req: NextRequest, context: RouteContext) {
  const { path } = await context.params
  return proxyRequest(req, path ?? [])
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
