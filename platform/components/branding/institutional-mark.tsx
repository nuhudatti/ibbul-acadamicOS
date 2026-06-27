import { cn } from '@/lib/utils'

interface InstitutionalMarkProps {
  className?: string
  size?: number
}

/** Default IBBUL crest mark when no uploaded logo is configured. */
export function InstitutionalMark({ className, size = 48 }: InstitutionalMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn('flex-shrink-0', className)}
      aria-hidden
    >
      <circle cx="32" cy="32" r="31" fill="#0F6B3E" />
      <circle cx="32" cy="32" r="24" fill="#ffffff" stroke="#C9A227" strokeWidth="1.5" />
      <path
        d="M32 14 L38 28 L32 24 L26 28 Z"
        fill="#0F6B3E"
        opacity="0.9"
      />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fill="#C9A227"
        fontSize="7"
        fontWeight="700"
        fontFamily="Georgia, serif"
      >
        IBBUL
      </text>
      <circle cx="32" cy="48" r="1.2" fill="#C9A227" />
    </svg>
  )
}
