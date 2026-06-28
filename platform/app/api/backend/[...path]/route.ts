/**
 * Same-origin proxy to Django backend — avoids CORS and wrong localhost URLs in production.
 * Set BACKEND_URL on the frontend host, e.g. https://your-api.onrender.com
 */
import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrlForProxy } from '@/lib/api-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FORWARD_HEADERS = [
  'authorization',
  'content-type',
  'accept',
  'accept-language',
  'cache-control',
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

    const responseHeaders = new Headers()
    const contentType = upstream.headers.get('content-type')
    if (contentType) responseHeaders.set('content-type', contentType)

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
