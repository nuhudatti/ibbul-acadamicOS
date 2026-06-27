'use client'

import { cn } from '@/lib/utils'
import { ArrowRight, LucideIcon } from 'lucide-react'

interface OversightCardProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  metrics: { label: string; value: string | number; highlight?: boolean }[]
  footer?: string
  onClick?: () => void
  accent?: string
}

export function OversightCard({
  title,
  subtitle,
  icon: Icon,
  metrics,
  footer,
  onClick,
  accent = 'from-slate-700 to-slate-900',
}: OversightCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full text-left rounded-2xl border border-slate-200/80 bg-white',
        'shadow-sm hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5',
        'transition-all duration-200 ease-out overflow-hidden focus:outline-none focus:ring-2 focus:ring-brand-200'
      )}
    >
      <div className={cn('h-1 w-full bg-gradient-to-r', accent)} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 truncate group-hover:text-brand-700 transition-colors">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-50 group-hover:border-brand-100 transition-colors">
              <Icon className="w-5 h-5 text-slate-500 group-hover:text-brand-600 transition-colors" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl bg-slate-50/80 px-3 py-2 border border-slate-100/80">
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{m.label}</div>
              <div
                className={cn(
                  'text-lg font-bold mt-0.5 tabular-nums',
                  m.highlight ? 'text-amber-600' : 'text-slate-800'
                )}
              >
                {m.value}
              </div>
            </div>
          ))}
        </div>

        {(footer || onClick) && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            {footer && <span className="text-xs text-slate-400">{footer}</span>}
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
              View details <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

interface StatusPillProps {
  label: string
  tone: 'success' | 'warning' | 'danger' | 'neutral'
}

export function StatusPill({ label, tone }: StatusPillProps) {
  const tones = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
  }
  return (
    <span className={cn('inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border', tones[tone])}>
      {label}
    </span>
  )
}

export function OversightSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="h-1 skeleton" />
          <div className="p-5 space-y-3">
            <div className="skeleton h-5 w-2/3 rounded-lg" />
            <div className="skeleton h-3 w-1/3 rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
              <div className="skeleton h-14 rounded-xl" />
              <div className="skeleton h-14 rounded-xl" />
              <div className="skeleton h-14 rounded-xl" />
              <div className="skeleton h-14 rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
