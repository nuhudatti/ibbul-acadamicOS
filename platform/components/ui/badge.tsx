import { cn } from '@/lib/utils'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'outline'

interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  className?: string
  dot?: boolean
}

const VARIANT_STYLES: Record<Variant, string> = {
  default:  'text-brand-700 bg-brand-50 border border-brand-200',
  success:  'text-emerald-700 bg-emerald-50 border border-emerald-200',
  warning:  'text-amber-700 bg-amber-50 border border-amber-200',
  danger:   'text-red-700 bg-red-50 border border-red-200',
  info:     'text-blue-700 bg-blue-50 border border-blue-200',
  neutral:  'text-slate-600 bg-slate-100 border border-slate-200',
  outline:  'text-slate-700 bg-white border border-slate-300',
}

export function Badge({ children, variant = 'default', className, dot }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
      VARIANT_STYLES[variant],
      className
    )}>
      {dot && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          variant === 'success' ? 'bg-emerald-500' :
          variant === 'warning' ? 'bg-amber-500' :
          variant === 'danger'  ? 'bg-red-500' :
          variant === 'info'    ? 'bg-blue-500' : 'bg-slate-400'
        )} />
      )}
      {children}
    </span>
  )
}
