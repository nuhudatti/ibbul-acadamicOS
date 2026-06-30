'use client'

import Link from 'next/link'
import {
  Lock, CheckCircle2, Circle, ClipboardList, FileText, HelpCircle,
  ChevronRight, Award, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PathStep } from '@/lib/learning-utils'
import { allStepsComplete } from '@/lib/learning-utils'
import { LCard, LBadge } from './learning-ui'

const ICONS = {
  lesson: FileText,
  quiz: HelpCircle,
  assignment: ClipboardList,
}

interface LearningPathProps {
  steps: PathStep[]
  offeringId: number
  isInstructor?: boolean
}

export function LearningPath({ steps, offeringId, isInstructor }: LearningPathProps) {
  const complete = allStepsComplete(steps)

  if (steps.length === 0) return null

  const completedCount = steps.filter((s) => s.status === 'completed').length
  const activeIndex = steps.findIndex((s) => s.status === 'active')
  const progressIndex = activeIndex >= 0 ? activeIndex : completedCount
  const fillPercent =
    steps.length <= 1 ? (completedCount ? 100 : 0) : (progressIndex / (steps.length - 1)) * 100

  return (
    <div className="space-y-6">
      {complete && !isInstructor && (
        <LCard className="!p-5 border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <Award className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-emerald-900">Course complete</p>
              <p className="text-sm text-emerald-700/80 mt-0.5">You finished every step in this learning path.</p>
            </div>
          </div>
        </LCard>
      )}

      <LCard className="!p-0 overflow-hidden border-slate-200/80 bg-gradient-to-br from-slate-50/80 via-white to-brand-50/20">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <p className="text-sm font-semibold text-slate-800">Learning path</p>
            </div>
            <p className="text-xs font-medium text-slate-500 tabular-nums">
              {completedCount} of {steps.length} steps
            </p>
          </div>
          <div className="mt-3 relative h-1.5 overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-600 via-brand-500 to-emerald-500 transition-all duration-700 ease-out"
              style={{ width: `${Math.min(100, fillPercent)}%` }}
            />
          </div>
        </div>

        <div className="relative px-4 py-6 sm:px-6">
          {/* Continuous vertical track behind all steps */}
          <div
            className="pointer-events-none absolute left-[39px] top-8 bottom-8 w-0.5 rounded-full bg-slate-200/90 sm:left-[43px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-[39px] top-8 w-0.5 rounded-full bg-gradient-to-b from-brand-600 via-brand-500 to-emerald-500 transition-all duration-700 ease-out sm:left-[43px]"
            style={{ height: `calc(${Math.min(100, fillPercent)}% - 2rem)` }}
            aria-hidden
          />

          {groupByModule(steps).map(({ moduleTitle, moduleIndex, moduleSteps }) => (
            <div key={`mod-${moduleIndex}`} className="relative mb-2 last:mb-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400 mb-4 pl-14 sm:pl-16">
                Module {moduleIndex + 1} · {moduleTitle}
              </p>
              <div className="space-y-1">
                {moduleSteps.map((step) => {
                  const Icon = ICONS[step.typeIcon]
                  const href = `/learning/offerings/${offeringId}/lessons/${step.lesson.id}`
                  const canOpen = isInstructor || step.status !== 'locked'

                  const inner = (
                    <div
                      className={cn(
                        'relative flex gap-4 rounded-2xl p-3 transition-all duration-200 sm:gap-5 sm:p-4',
                        step.status === 'active' && 'bg-white/90 shadow-md shadow-brand-600/5 ring-1 ring-brand-100',
                        step.status === 'completed' && 'bg-white/50',
                        step.status === 'locked' && 'opacity-80',
                        canOpen && step.status !== 'locked' && 'hover:bg-white hover:shadow-sm cursor-pointer'
                      )}
                    >
                      <div
                        className={cn(
                          'relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all duration-300 sm:w-11 sm:h-11',
                          step.status === 'completed' && 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/25',
                          step.status === 'active' && 'bg-brand-700 border-brand-600 text-white shadow-lg shadow-brand-600/30 ring-4 ring-brand-100 scale-105',
                          step.status === 'locked' && 'bg-white border-slate-200 text-slate-300'
                        )}
                      >
                        {step.status === 'completed' ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : step.status === 'locked' ? (
                          <Lock className="w-4 h-4" />
                        ) : (
                          <Circle className="w-4 h-4 fill-current" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <LBadge variant={step.status === 'active' ? 'info' : step.status === 'completed' ? 'success' : 'neutral'}>
                                {step.typeLabel}
                              </LBadge>
                              {step.status === 'active' && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 animate-pulse">
                                  Current step
                                </span>
                              )}
                            </div>
                            <h3 className={cn(
                              'font-semibold text-slate-900',
                              step.status === 'locked' && 'text-slate-500'
                            )}>
                              {step.lesson.title}
                            </h3>
                            {step.status === 'locked' && step.lockReason && (
                              <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> {step.lockReason}
                              </p>
                            )}
                            {step.status === 'active' && (
                              <p className="text-xs text-emerald-700 mt-2 font-medium inline-flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg">
                                Unlocked — open when you are ready <ChevronRight className="w-3.5 h-3.5" />
                              </p>
                            )}
                          </div>
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                            step.status === 'active' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-400'
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )

                  if (!canOpen) return <div key={step.id}>{inner}</div>
                  return (
                    <Link key={step.id} href={href} className="block">
                      {inner}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </LCard>
    </div>
  )
}

function groupByModule(steps: PathStep[]) {
  const groups: { moduleTitle: string; moduleIndex: number; moduleSteps: PathStep[] }[] = []
  let current: (typeof groups)[0] | null = null

  for (const step of steps) {
    if (!current || current.moduleIndex !== step.moduleIndex) {
      current = { moduleTitle: step.moduleTitle, moduleIndex: step.moduleIndex, moduleSteps: [] }
      groups.push(current)
    }
    current.moduleSteps.push(step)
  }
  return groups
}
