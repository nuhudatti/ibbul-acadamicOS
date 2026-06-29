import type { User } from './types'

export interface ParsedLoginResponse {
  user: User
  access: string
  refresh: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coercePayload(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return raw
    }
  }
  return raw
}

/** Unwrap optional `{ data: { user, tokens | access } }` envelopes. */
function unwrapPayload(raw: unknown): Record<string, unknown> | null {
  const payload = coercePayload(raw)
  if (!isRecord(payload)) return null

  if (isRecord(payload.data)) {
    const inner = payload.data
    if ('user' in inner || 'tokens' in inner || 'access' in inner) {
      return inner
    }
  }

  return payload
}

function readToken(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function extractTokens(payload: Record<string, unknown>): { access: string; refresh: string } | null {
  if (isRecord(payload.tokens)) {
    const access = readToken(payload.tokens.access)
    const refresh = readToken(payload.tokens.refresh)
    if (access && refresh) return { access, refresh }
  }

  const access = readToken(payload.access)
  const refresh = readToken(payload.refresh)
  if (access && refresh) return { access, refresh }

  return null
}

function extractUser(payload: Record<string, unknown>): User | null {
  if (!isRecord(payload.user)) return null
  const id = payload.user.id
  if (typeof id !== 'number' && typeof id !== 'string') return null
  return payload.user as unknown as User
}

/** Log raw login JSON in development before client-side validation. */
export function logLoginResponseInDev(raw: unknown): void {
  if (process.env.NODE_ENV !== 'development') return
  console.log('[login] POST /accounts/login/ response:', raw)
}

/**
 * Accept Django login payloads in either shape:
 * - { user, tokens: { access, refresh } }
 * - { user, access, refresh }
 */
export function parseLoginResponse(raw: unknown): ParsedLoginResponse | null {
  logLoginResponseInDev(raw)

  const payload = unwrapPayload(raw)
  if (!payload) return null

  const tokens = extractTokens(payload)
  const user = extractUser(payload)
  if (!tokens || !user) return null

  return {
    user,
    access: tokens.access,
    refresh: tokens.refresh,
  }
}
