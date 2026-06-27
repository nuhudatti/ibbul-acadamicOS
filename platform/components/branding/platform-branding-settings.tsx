'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Palette, RotateCcw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DEFAULT_PLATFORM_BRAND,
  getPlatformBrand,
  mergePlatformBrand,
  BRAND_UPDATE_EVENT,
  brandToApiPayload,
  type PlatformBrand,
} from '@/lib/platform-branding'
import { coreAPI } from '@/lib/api'
import { optimizeBackgroundFile, optimizeLogoFile } from '@/lib/image-utils'
import { PlatformLogo } from '@/components/branding/platform-logo'

type ImageField = 'logoDataUrl' | 'loginBackgroundDataUrl' | 'dashboardBannerDataUrl'

const IMAGE_FIELDS: {
  key: ImageField
  label: string
  hint: string
  previewClass: string
}[] = [
  {
    key: 'logoDataUrl',
    label: 'University logo',
    hint: 'Appears on login, sidebar, and dashboard. Square PNG or SVG, max 500 KB.',
    previewClass: 'aspect-square max-w-[120px]',
  },
  {
    key: 'loginBackgroundDataUrl',
    label: 'Login background',
    hint: 'School entrance or campus photo. Auto-resized to Full HD (1920×1080), compressed under 500 KB.',
    previewClass: 'aspect-video w-full max-w-lg',
  },
  {
    key: 'dashboardBannerDataUrl',
    label: 'Dashboard banner',
    hint: 'Wide banner for the command centre hero. Recommended 1600×400 px.',
    previewClass: 'aspect-[4/1] w-full',
  },
]

export function PlatformBrandingSettings() {
  const [form, setForm] = useState<{
    platformName: string
    platformShortName: string
    tagline: string
    footerText: string
  }>({
    platformName: DEFAULT_PLATFORM_BRAND.platformName,
    platformShortName: DEFAULT_PLATFORM_BRAND.platformShortName,
    tagline: DEFAULT_PLATFORM_BRAND.tagline,
    footerText: DEFAULT_PLATFORM_BRAND.footerText,
  })
  const [images, setImages] = useState<Pick<PlatformBrand, ImageField>>({})
  const [saving, setSaving] = useState(false)
  const fileRefs = useRef<Partial<Record<ImageField, HTMLInputElement | null>>>({})

  useEffect(() => {
    const brand = getPlatformBrand()
    setForm({
      platformName: brand.platformName ?? DEFAULT_PLATFORM_BRAND.platformName,
      platformShortName: brand.platformShortName ?? DEFAULT_PLATFORM_BRAND.platformShortName,
      tagline: brand.tagline ?? DEFAULT_PLATFORM_BRAND.tagline,
      footerText: brand.footerText ?? DEFAULT_PLATFORM_BRAND.footerText,
    })
    setImages({
      logoDataUrl: brand.logoDataUrl,
      loginBackgroundDataUrl: brand.loginBackgroundDataUrl,
      dashboardBannerDataUrl: brand.dashboardBannerDataUrl,
    })
  }, [])

  const handleImage = async (field: ImageField, file: File | undefined) => {
    if (!file) return
    const typeMap: Record<ImageField, 'logo' | 'background' | 'banner'> = {
      logoDataUrl: 'logo',
      loginBackgroundDataUrl: 'background',
      dashboardBannerDataUrl: 'banner',
    }
    try {
      const res = await coreAPI.uploadPlatformBrandingAsset(file, typeMap[field])
      const url = res.data?.url as string
      if (url) {
        setImages((prev) => ({ ...prev, [field]: url }))
        toast.success('Uploaded to Cloudinary — save to apply across the platform')
        return
      }
    } catch {
      /* fallback to optimized data URL for local dev without Cloudinary */
    }
    try {
      let dataUrl: string
      if (field === 'logoDataUrl') {
        dataUrl = await optimizeLogoFile(file)
      } else {
        dataUrl = await optimizeBackgroundFile(file)
      }
      setImages((prev) => ({ ...prev, [field]: dataUrl }))
      toast.success('Image ready — save to apply (enable Cloudinary in production)')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read image')
    }
  }

  const removeImage = (field: ImageField) => {
    setImages((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const merged = mergePlatformBrand({ ...form, ...images })
      await coreAPI.updatePlatformBranding(brandToApiPayload(merged))
      toast.success('University branding saved — login, emails, and dashboard updated')
    } catch (e) {
      mergePlatformBrand({ ...form, ...images })
      toast.error(
        e instanceof Error
          ? e.message
          : 'Saved on this device only — sign in as Super Admin to sync to the server'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (!confirm('Reset all branding to IBBUL defaults? Uploaded images will be cleared.')) return
    localStorage.removeItem('ibbul-platform-brand')
    window.dispatchEvent(new CustomEvent(BRAND_UPDATE_EVENT))
    setForm({
      platformName: DEFAULT_PLATFORM_BRAND.platformName,
      platformShortName: DEFAULT_PLATFORM_BRAND.platformShortName,
      tagline: DEFAULT_PLATFORM_BRAND.tagline,
      footerText: DEFAULT_PLATFORM_BRAND.footerText,
    })
    setImages({})
    toast.success('Branding reset to defaults')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-brand-200/60 bg-gradient-to-br from-brand-50/80 to-white p-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <PlatformLogo size="xl" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Palette className="w-4 h-4 text-brand-700" />
            <h2 className="text-sm font-semibold text-slate-900">University branding</h2>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
            Configure the official visual identity of IBBUL Academic OS. Logo, login background, and
            dashboard banner apply instantly across the platform on this browser. Upload the real IBBUL
            crest when available.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800 pb-2 border-b border-slate-100">
          Platform identity
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(
            [
              { key: 'platformName', label: 'Platform name', placeholder: 'IBBUL Academic OS' },
              { key: 'platformShortName', label: 'Short name', placeholder: 'IBBUL' },
              { key: 'tagline', label: 'Academic tagline', placeholder: 'Learning for Service' },
              {
                key: 'footerText',
                label: 'Footer information',
                placeholder: DEFAULT_PLATFORM_BRAND.footerText,
              },
            ] as const
          ).map((field) => (
            <div
              key={field.key}
              className={cn('space-y-1.5', field.key === 'footerText' && 'sm:col-span-2')}
            >
              <label className="block text-xs font-medium text-slate-600">{field.label}</label>
              <input
                type="text"
                value={form[field.key]}
                onChange={(e) => setForm((p) => ({ ...p, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
        <h3 className="text-sm font-semibold text-slate-800 pb-2 border-b border-slate-100">
          Visual assets
        </h3>
        {IMAGE_FIELDS.map(({ key, label, hint, previewClass }) => (
          <div key={key} className="space-y-3 pb-6 last:pb-0 last:border-0 border-b border-slate-50">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{label}</p>
                <p className="text-xs text-slate-500 mt-1">{hint}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => fileRefs.current[key]?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    Upload
                  </button>
                  {images[key] && (
                    <button
                      type="button"
                      onClick={() => removeImage(key)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={(el) => { fileRefs.current[key] = el }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    handleImage(key, e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>
              <div
                className={cn(
                  'rounded-xl border border-dashed border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center',
                  previewClass
                )}
              >
                {images[key] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={images[key]} alt={label} className="w-full h-full object-cover" />
                ) : key === 'logoDataUrl' ? (
                  <PlatformLogo size="lg" />
                ) : (
                  <span className="text-[11px] text-slate-400 px-4 text-center">No image uploaded</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl gradient-brand text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save branding
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to defaults
        </button>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Branding syncs to the server when you save as Super Admin — used on login pages, invitation
        emails, and password reset messages across all devices.
      </p>
    </div>
  )
}
