'use client'

import { cn } from '@/lib/utils'
import { usePlatformBrand } from '@/hooks/use-platform-brand'
import { InstitutionalMark } from '@/components/branding/institutional-mark'

interface PlatformLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'on-dark' | 'plain'
  showRing?: boolean
  className?: string
  alt?: string
}

const SIZE_MAP = {
  xs: { box: 'w-7 h-7', mark: 28 },
  sm: { box: 'w-9 h-9', mark: 36 },
  md: { box: 'w-11 h-11', mark: 44 },
  lg: { box: 'w-14 h-14', mark: 56 },
  xl: { box: 'w-20 h-20', mark: 80 },
}

export function PlatformLogo({
  size = 'md',
  variant = 'default',
  showRing = true,
  className,
  alt = 'University logo',
}: PlatformLogoProps) {
  const { logo, isReady } = usePlatformBrand()
  const { box, mark } = SIZE_MAP[size]

  const ringClass =
    variant === 'on-dark'
      ? 'ring-1 ring-white/20 bg-white/95'
      : variant === 'plain'
        ? 'bg-transparent'
        : showRing
          ? 'ring-1 ring-brand-200/80 bg-white shadow-sm'
          : 'bg-white'

  if (isReady && logo) {
    return (
      <div className={cn(box, 'rounded-xl overflow-hidden flex-shrink-0', ringClass, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={alt} className="w-full h-full object-contain" />
      </div>
    )
  }

  return (
    <div className={cn(box, 'rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center', ringClass, className)}>
      <InstitutionalMark size={mark} />
    </div>
  )
}
