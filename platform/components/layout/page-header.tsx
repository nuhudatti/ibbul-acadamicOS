'use client'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  action?: React.ReactNode
  breadcrumb?: React.ReactNode
  className?: string
  compact?: boolean
}

/** Shared institutional page header — matches Command Centre / governance pattern. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  breadcrumb,
  className,
  compact,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'institutional-card px-5 py-4 sm:px-6 sm:py-5',
        compact && 'py-3.5 sm:py-4',
        className
      )}
    >
      {breadcrumb}
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-start justify-between gap-4',
          breadcrumb && 'mt-3'
        )}
      >
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700 mb-1">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-xl sm:text-2xl text-slate-900 tracking-tight leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">{description}</p>
          )}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2 flex-shrink-0">{action}</div>}
      </div>
    </div>
  )
}

/** Standard page wrapper spacing used across Results, Learning, Admin. */
export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-6 sm:space-y-8 animate-fade-in', className)}>
      {children}
    </div>
  )
}
