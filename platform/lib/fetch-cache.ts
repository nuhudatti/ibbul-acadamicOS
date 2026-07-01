/**
 * In-flight GET deduplication — merges identical concurrent requests.
 * Same pattern as use-platform-brand.ts fetchBrandingOnce().
 */
const inflight = new Map<string, Promise<unknown>>()

export function dedupeGet<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  const promise = fetcher().finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}

const cache = new Map<string, { data: unknown; expires: number }>()
const DEFAULT_TTL_MS = 30_000

export function cachedGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) {
    return Promise.resolve(hit.data as T)
  }
  return dedupeGet(key, fetcher).then((data) => {
    cache.set(key, { data, expires: Date.now() + ttlMs })
    return data
  })
}

export function invalidateCacheKey(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}
