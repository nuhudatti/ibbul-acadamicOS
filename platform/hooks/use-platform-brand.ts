'use client'

import { useCallback, useEffect, useState } from 'react'
import { coreAPI } from '@/lib/api'
import {
  BRAND_UPDATE_EVENT,
  DEFAULT_PLATFORM_BRAND,
  brandFromApi,
  getPlatformBrand,
  mergePlatformBrand,
  resolveBrandText,
  type PlatformBrand,
} from '@/lib/platform-branding'

let brandingFetchPromise: Promise<void> | null = null

function fetchBrandingOnce(): Promise<void> {
  if (brandingFetchPromise) return brandingFetchPromise
  brandingFetchPromise = coreAPI
    .getPlatformBrandingPublic()
    .then((res) => {
      const fromServer = brandFromApi(res.data as Record<string, unknown>)
      if (Object.keys(fromServer).length > 0) {
        mergePlatformBrand(fromServer)
      }
    })
    .catch(() => {
      brandingFetchPromise = null
    })
  return brandingFetchPromise
}

/**
 * Branding hook — SSR-safe, single API fetch per session.
 */
export function usePlatformBrand() {
  const [brand, setBrand] = useState<PlatformBrand>({})
  const [isReady, setIsReady] = useState(false)

  const refresh = useCallback(() => {
    setBrand(getPlatformBrand())
  }, [])

  useEffect(() => {
    refresh()
    setIsReady(true)

    const handler = () => refresh()
    window.addEventListener(BRAND_UPDATE_EVENT, handler)

    fetchBrandingOnce().then(() => refresh())

    return () => window.removeEventListener(BRAND_UPDATE_EVENT, handler)
  }, [refresh])

  return {
    brand,
    isReady,
    refresh,
    platformName: resolveBrandText(brand, 'platformName'),
    platformShortName: resolveBrandText(brand, 'platformShortName'),
    tagline: resolveBrandText(brand, 'tagline'),
    footerText: resolveBrandText(brand, 'footerText'),
    universityFullName: DEFAULT_PLATFORM_BRAND.universityFullName,
    primaryColor: brand.primaryColor ?? DEFAULT_PLATFORM_BRAND.primaryColor,
    accentColor: brand.accentColor ?? DEFAULT_PLATFORM_BRAND.accentColor,
    logo: isReady ? (brand.logoDataUrl ?? null) : null,
    loginBackground: isReady ? (brand.loginBackgroundDataUrl ?? null) : null,
    dashboardBanner: isReady ? (brand.dashboardBannerDataUrl ?? null) : null,
  }
}
