'use client'

import Link from 'next/link'
import { CheckCircle2, Circle, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PathStep } from '@/lib/learning-utils'

interface LearningJourneyRailProps {
  steps: PathStep[]
  offeringId: number
  activeLessonId?: number
  compact?: boolean
}

export function LearningJourneyRail({
  steps,
  offeringId,
  activeLessonId,
  compact = false,
}: LearningJourneyRailProps) {
  if (steps.length === 0) return null

  const completedCount = steps.filter((s) => s.status === 'completed').length
  const activeIndex = steps.findIndex((s) =>
    activeLessonId ? s.lesson.id === activeLessonId : s.status === 'active'
  )
  const progressIndex = activeIndex >= 0 ? activeIndex : completedCount
  const fillPercent =
    steps.length <= 1 ? 0 : Math.min(100, (progressIndex / (steps.length - 1)) * 100)

  if (compact) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-brand-50/30 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">
            Your journey
          </p>
          <p className="text-xs font-medium text-slate-500 tabular-nums">
            {completedCount} of {steps.length} complete
          </p>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-200/80">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-600 via-brand-500 to-emerald-500 transition-all duration-700 ease-out"
            style={{ width: `${fillPercent}%` }}
          />
        </div>
        <div className="mt-4 flex items-start gap-0 overflow-x-auto pb-1 scrollbar-thin">
          {steps.map((step, index) => {
            const isActive = activeLessonId
              ? step.lesson.id === activeLessonId
              : step.status === 'active'
            const isComplete = step.status === 'completed'
            const isLocked = step.status === 'locked'
            const href = `/learning/offerings/${offeringId}/lessons/${step.lesson.id}`
            const isLast = index === steps.length - 1

            const node = (
              <div className="flex flex-col items-center min-w-[52px]">
                <div
                  className={cn(
                    'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300',
                    isComplete && 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25',
                    isActive && !isComplete && 'border-brand-600 bg-brand-700 text-white shadow-md shadow-brand-600/30 ring-4 ring-brand-100',
                    isLocked && 'border-slate-200 bg-white text-slate-300',
                    !isActive && !isComplete && !isLocked && 'border-slate-300 bg-white text-slate-400'
                  )}
                >
                  {isComplete ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isLocked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 fill-current" />
                  )}
                </div>
                <span
                  className={cn(
                    'mt-1.5 max-w-[52px] truncate text-[9px] font-medium',
                    isActive ? 'text-brand-700' : isComplete ? 'text-emerald-700' : 'text-slate-400'
                  )}
                >
                  {index + 1}
                </span>
              </div>
            )

            return (
              <div key={step.id} className="flex items-start">
                {!isLocked ? (
                  <Link href={href} className="group">
                    {node}
                  </Link>
                ) : (
                  node
                )}
                {!isLast && (
                  <div className="relative mx-0.5 mt-4 h-0.5 w-6 flex-shrink-0 overflow-hidden rounded-full bg-slate-200 sm:w-8">
                    <div
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
                        isComplete ? 'w-full bg-emerald-500' : isActive ? 'w-1/2 bg-brand-500' : 'w-0'
                      )}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return null
}
