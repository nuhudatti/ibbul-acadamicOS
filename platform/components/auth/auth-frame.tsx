'use client'

import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { PlatformLogo } from '@/components/branding/platform-logo'
import { usePlatformBrand } from '@/hooks/use-platform-brand'
import { cn } from '@/lib/utils'

interface AuthFrameProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  wide?: boolean
  className?: string
}

/**
 * Institutional auth layout — IBBUL green panel + cream workspace.
 * No photo backgrounds; SSR-safe; matches in-app sidebar palette.
 */
export function AuthFrame({
  children,
  title,
  subtitle,
  backHref,
  backLabel = 'Back to sign in',
  wide = false,
  className,
}: AuthFrameProps) {
  const { platformName, tagline, universityFullName } = usePlatformBrand()
  const showBackLink = backHref !== undefined

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f4f6f8] lg:flex-row">
      {/* Institutional identity — same tone as app sidebar (#062b1a) */}
      <aside className="relative flex shrink-0 flex-col justify-center border-b-4 border-gold-500 bg-brand-900 px-6 py-10 text-white lg:w-[min(440px,40%)] lg:border-b-0 lg:border-r lg:border-r-white/5 lg:px-12 lg:py-16">
        <div className="mx-auto w-full max-w-[320px] text-center lg:mx-0 lg:text-left">
          <PlatformLogo size="xl" variant="on-dark" className="mx-auto lg:mx-0" />
          <h1 className="font-display mt-6 text-[1.75rem] leading-tight tracking-tight sm:text-[2rem]">
            {platformName}
          </h1>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-400">
            {tagline}
          </p>

          <div className="mt-8 hidden border-t border-white/10 pt-8 lg:block">
            <p className="text-sm leading-relaxed text-white/75">{universityFullName}</p>
            <p className="mt-5 flex items-center gap-2 text-xs text-white/45">
              <ShieldCheck className="h-3.5 w-3.5 text-gold-500/80" />
              Official academic platform · Secure sign-in
            </p>
          </div>
        </div>
      </aside>

      {/* Form workspace — cream surface like main app */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div
          className={cn(
            'w-full animate-slide-up',
            wide ? 'max-w-[440px]' : 'max-w-[400px]',
            className
          )}
        >
          <div className="auth-panel overflow-hidden">
            {(title || subtitle) && (
              <div className="border-b border-slate-100 bg-brand-50/30 px-7 pb-4 pt-7 text-center">
                {title && (
                  <h2 className="font-display text-xl text-brand-950">{title}</h2>
                )}
                {subtitle && (
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{subtitle}</p>
                )}
              </div>
            )}
            <div className={cn('px-7 py-7', !title && !subtitle && 'pt-8')}>{children}</div>
          </div>

          {showBackLink && (
            <p className="mt-6 text-center">
              <Link
                href={backHref || '/login'}
                className="text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline"
              >
                {backLabel}
              </Link>
            </p>
          )}

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[10px] text-slate-400 lg:hidden">
            <ShieldCheck className="h-3 w-3 text-brand-600" />
            {universityFullName}
          </p>
        </div>
      </main>
    </div>
  )
}
