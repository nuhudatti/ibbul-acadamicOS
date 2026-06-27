'use client'

import { cn, getSemesterLabel } from '@/lib/utils'
import {
  SUMMARY_FIELD_LABELS,
  formatSummaryValue,
  normalizeSemesterSummary,
  summaryHasData,
} from '@/lib/summary'
import type { SemesterSummary } from '@/lib/types'

interface SemesterSummaryPanelProps {
  summary?: Partial<SemesterSummary> | Record<string, unknown> | null
  session?: string
  semester?: string
  title?: string
  compact?: boolean
  className?: string
}

export function SemesterSummaryPanel({
  summary: raw,
  session,
  semester,
  title = 'Semester Summary',
  compact = false,
  className,
}: SemesterSummaryPanelProps) {
  const summary = normalizeSemesterSummary(raw)
  const hasData = summaryHasData(summary)
  const displaySession = session ?? summary?.session
  const displaySemester = semester ?? summary?.semester

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white overflow-hidden', className)}>
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {(displaySession || displaySemester) && (
          <span className="text-xs text-slate-400">
            {displaySession}
            {displaySemester ? ` · ${getSemesterLabel(displaySemester)}` : ''}
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="px-5 py-4 text-sm text-slate-500">
          No summary row in the uploaded result sheet for this semester yet.
        </div>
      ) : (
        <div className={cn('p-5', compact ? 'space-y-3' : 'space-y-4')}>
          <div className={cn(
            'grid gap-3',
            compact
              ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6'
              : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7'
          )}>
            {SUMMARY_FIELD_LABELS.map(({ key, label, gpa }) => (
              <div
                key={key}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-center',
                  key === 'gpa' || key === 'cgpa'
                    ? 'border-brand-200 bg-brand-50'
                    : 'border-slate-100 bg-slate-50'
                )}
              >
                <div className={cn(
                  'font-bold text-slate-900',
                  compact ? 'text-base' : 'text-lg',
                  (key === 'gpa' || key === 'cgpa') && 'text-brand-700'
                )}>
                  {formatSummaryValue(key, String(summary?.[key] ?? ''), gpa)}
                </div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                  {label}
                </div>
              </div>
            ))}
          </div>

          {summary?.outstanding_courses && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-semibold text-amber-800">Outstanding courses: </span>
              {summary.outstanding_courses}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
