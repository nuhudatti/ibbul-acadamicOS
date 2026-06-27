import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon?: LucideIcon
  iconColor?: string
  iconBg?: string
  className?: string
  variant?: 'default' | 'accent'
}

export function StatCard({
  label, value, sub, icon: Icon,
  iconColor = 'text-brand-700',
  iconBg = 'bg-brand-50',
  className,
  variant = 'default',
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-4 sm:p-5 shadow-card',
        variant === 'accent' ? 'border-gold-200/80' : 'border-slate-200/80',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 leading-none tracking-tight tabular-nums">
            {value}
          </p>
          {sub && <p className="text-xs text-slate-400 mt-2">{sub}</p>}
        </div>
        {Icon && (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
            <Icon className={cn('w-5 h-5', iconColor)} />
          </div>
        )}
      </div>
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="skeleton h-3 w-20 rounded" />
      <div className="skeleton h-8 w-14 rounded" />
    </div>
  )
}
