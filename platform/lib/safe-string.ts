/** Null-safe string helpers — never throw on undefined API fields. */

export function safeStr(value: unknown, fallback = ''): string {
  if (value == null) return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

export function safeTrim(value: unknown, fallback = ''): string {
  return safeStr(value, fallback).trim() || fallback
}

export function safeReplace(
  value: unknown,
  search: string | RegExp,
  replacement: string,
  fallback = '',
): string {
  return safeStr(value, fallback).replace(search, replacement)
}

export function safeIncludes(value: unknown, needle: string): boolean {
  return safeStr(value).includes(needle)
}

export function safeStartsWith(value: unknown, prefix: string): boolean {
  return safeStr(value).startsWith(prefix)
}

export function safeEndsWith(value: unknown, suffix: string): boolean {
  return safeStr(value).endsWith(suffix)
}

export function safeSplit(value: unknown, separator: string | RegExp, fallback: string[] = []): string[] {
  const text = safeStr(value)
  return text ? text.split(separator) : fallback
}

export function formatContentTypeLabel(value: unknown): string {
  const label = safeReplace(value, '_', ' ').trim()
  return label || 'Step'
}
