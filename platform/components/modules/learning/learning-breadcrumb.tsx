'use client'

import Link from 'next/link'
import { ChevronRight, Home, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LearningCrumb {
  label: string
  href?: string
}

export function LearningBreadcrumb({ items }: { items: LearningCrumb[] }) {
  return (
    <nav aria-label="Learning breadcrumb" className="flex items-center flex-wrap gap-1 text-sm">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
        <Home className="w-3.5 h-3.5" />
      </Link>
      <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
      <Link href="/learning" className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-600 transition-colors">
        <BookOpen className="w-3.5 h-3.5" />
        Learning
      </Link>
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          {item.href ? (
            <Link
              href={item.href}
              className={cn(
                'transition-colors max-w-[200px] truncate',
                i === items.length - 1 ? 'font-semibold text-slate-800' : 'text-slate-500 hover:text-brand-600'
              )}
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-slate-800 max-w-[200px] truncate">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
