'use client'

import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

/* ─── Learning module — IBBUL institutional design (matches platform) ─── */

export function LearningShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-h-full space-y-6 sm:space-y-8 animate-fade-in', className)}>
      {children}
    </div>
  )
}

export function LPageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('institutional-card px-5 py-4 sm:px-6 sm:py-5', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
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
        {action && (
          <div className="flex flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto sm:flex-shrink-0 sm:max-w-[280px]">
            {action}
          </div>
        )}
      </div>
    </header>
  )
}

export function LCard({
  children,
  className,
  hover,
  padding = 'md',
}: {
  children: React.ReactNode
  className?: string
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}) {
  const pad = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' }[padding]
  return (
    <div
      className={cn(
        'institutional-card',
        hover && 'hover:shadow-card-hover hover:border-brand-200/60 transition-all cursor-pointer',
        pad,
        className
      )}
    >
      {children}
    </div>
  )
}

export function LButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizes = {
    sm: 'h-9 px-3.5 text-xs gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-11 px-5 text-sm gap-2',
  }
  const variants = {
    primary: 'gradient-brand text-white hover:opacity-95 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-brand-50/50 hover:border-brand-200',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'bg-red-50 text-red-700 border border-red-100 hover:bg-red-100',
  }
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150',
        'disabled:opacity-50 disabled:pointer-events-none',
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function LBreadcrumb({
  items,
}: {
  items: { label: string; href?: string }[]
}) {
  return (
    <nav className="flex items-center gap-1 text-xs flex-wrap rounded-xl bg-brand-50 border border-brand-100/80 px-4 py-2.5">
      <a href="/learning" className="text-brand-700 font-semibold hover:text-brand-900 transition-colors">
        Learning
      </a>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-brand-300 mx-0.5">/</span>
          {item.href ? (
            <a href={item.href} className="text-brand-600 hover:text-brand-900 transition-colors truncate max-w-[160px]">
              {item.label}
            </a>
          ) : (
            <span className="text-brand-900 font-semibold truncate max-w-[200px]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function LBadge({
  children,
  variant = 'neutral',
  dot,
  className,
}: {
  children: React.ReactNode
  variant?: 'neutral' | 'success' | 'warning' | 'info' | 'live'
  dot?: boolean
  className?: string
}) {
  const variants = {
    neutral: 'bg-slate-100 text-slate-600',
    success: 'bg-brand-50 text-brand-800',
    warning: 'bg-gold-50 text-gold-800',
    info: 'bg-brand-50 text-brand-700',
    live: 'bg-brand-50 text-brand-800',
  }
  const dotColors = {
    neutral: 'bg-slate-400',
    success: 'bg-brand-600',
    warning: 'bg-gold-500',
    info: 'bg-brand-600',
    live: 'bg-brand-600 animate-pulse',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide',
        variants[variant],
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />}
      {children}
    </span>
  )
}

export function LProgressRing({
  percent,
  size = 56,
  stroke = 4,
}: {
  percent: number
  size?: number
  stroke?: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (percent / 100) * c
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#0F6B3E"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-800">
        {percent}%
      </span>
    </div>
  )
}

export function LStat({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string
  value: string | number
  icon?: LucideIcon
  className?: string
}) {
  return (
    <LCard className={cn('!p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1 tracking-tight tabular-nums">{value}</p>
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0 ring-1 ring-brand-100">
            <Icon className="w-4 h-4 text-brand-700" />
          </div>
        )}
      </div>
    </LCard>
  )
}

export function LSkeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

export function LEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <LCard className="text-center py-14 px-6">
      <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4 ring-1 ring-brand-100">
        <Icon className="w-7 h-7 text-brand-700" />
      </div>
      <h3 className="font-display text-base text-slate-800">{title}</h3>
      <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </LCard>
  )
}
