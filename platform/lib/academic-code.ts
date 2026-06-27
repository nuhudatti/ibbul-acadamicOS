'use client'

const STOP_WORDS = new Set(['of', 'the', 'and', 'for', 'a', 'an', 'faculty'])

/** Suggest a short faculty/department code from a full name (e.g. "Faculty of Natural Sciences" → FNS). */
export function suggestAcademicCode(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .filter((w) => !STOP_WORDS.has(w.toLowerCase()))

  if (words.length === 0) return ''

  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase()
  }

  return words
    .slice(0, 5)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
