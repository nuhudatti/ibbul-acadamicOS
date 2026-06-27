/** Institution-wide branding — Super Admin UI + server sync for emails and auth pages. */

export interface PlatformBrand {
  logoDataUrl?: string
  loginBackgroundDataUrl?: string
  dashboardBannerDataUrl?: string
  platformName?: string
  platformShortName?: string
  tagline?: string
  footerText?: string
  primaryColor?: string
  accentColor?: string
  updatedAt?: string
}

export const BRAND_STORAGE_KEY = 'ibbul-platform-brand'
export const BRAND_UPDATE_EVENT = 'ibbul-brand-updated'

export const DEFAULT_PLATFORM_BRAND = {
  platformName: 'IBBUL Academic OS',
  platformShortName: 'IBBUL',
  tagline: 'Learning for Service',
  footerText:
    'Ibrahim Badamasi Babangida University, Lapai · Niger State, Nigeria · Est. 2005',
  universityFullName: 'Ibrahim Badamasi Babangida University, Lapai',
  primaryColor: '#0F6B3E',
  accentColor: '#C9A227',
} as const

export function getPlatformBrand(): PlatformBrand {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(BRAND_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PlatformBrand
  } catch {
    return {}
  }
}

export function setPlatformBrand(brand: PlatformBrand): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(
    BRAND_STORAGE_KEY,
    JSON.stringify({ ...brand, updatedAt: new Date().toISOString() })
  )
  window.dispatchEvent(new CustomEvent(BRAND_UPDATE_EVENT))
}

export function clearPlatformBrandField(
  field: keyof Pick<
    PlatformBrand,
    'logoDataUrl' | 'loginBackgroundDataUrl' | 'dashboardBannerDataUrl'
  >
): void {
  const current = getPlatformBrand()
  const next = { ...current }
  delete next[field]
  setPlatformBrand(next)
}

export function mergePlatformBrand(partial: Partial<PlatformBrand>): PlatformBrand {
  const merged = { ...getPlatformBrand(), ...partial, updatedAt: new Date().toISOString() }
  setPlatformBrand(merged)
  return merged
}

export function resolveBrandText(
  brand: PlatformBrand,
  key: 'platformName' | 'platformShortName' | 'tagline' | 'footerText'
): string {
  const value = brand[key]
  if (value?.trim()) return value.trim()
  return DEFAULT_PLATFORM_BRAND[key]
}

/** Map public API payload into local PlatformBrand shape. */
export function brandFromApi(data: Record<string, unknown>): PlatformBrand {
  const next: PlatformBrand = { updatedAt: new Date().toISOString() }
  const map: [keyof PlatformBrand, string][] = [
    ['platformName', 'platformName'],
    ['platformShortName', 'platformShortName'],
    ['tagline', 'tagline'],
    ['footerText', 'footerText'],
    ['primaryColor', 'primaryColor'],
    ['accentColor', 'accentColor'],
    ['logoDataUrl', 'logoDataUrl'],
    ['loginBackgroundDataUrl', 'loginBackgroundDataUrl'],
    ['dashboardBannerDataUrl', 'dashboardBannerDataUrl'],
  ]
  for (const [localKey, apiKey] of map) {
    const val = data[apiKey]
    if (typeof val === 'string' && val.trim()) {
      next[localKey] = val.trim()
    }
  }
  return next
}

/** Payload for PATCH /api/core/platform-branding/ */
export function brandToApiPayload(brand: Partial<PlatformBrand>): Record<string, string> {
  const payload: Record<string, string> = {}
  if (brand.platformName !== undefined) payload.platformName = brand.platformName
  if (brand.platformShortName !== undefined) payload.platformShortName = brand.platformShortName
  if (brand.tagline !== undefined) payload.tagline = brand.tagline
  if (brand.footerText !== undefined) payload.footerText = brand.footerText
  if (brand.primaryColor !== undefined) payload.primaryColor = brand.primaryColor
  if (brand.accentColor !== undefined) payload.accentColor = brand.accentColor
  if (brand.logoDataUrl !== undefined) payload.logoDataUrl = brand.logoDataUrl ?? ''
  if (brand.loginBackgroundDataUrl !== undefined) {
    payload.loginBackgroundDataUrl = brand.loginBackgroundDataUrl ?? ''
  }
  if (brand.dashboardBannerDataUrl !== undefined) {
    payload.dashboardBannerDataUrl = brand.dashboardBannerDataUrl ?? ''
  }
  return payload
}

export { readImageFileAsDataUrl } from '@/lib/department-branding'
