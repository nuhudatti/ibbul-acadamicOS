'use client'

import Link from 'next/link'
import {
  Lock, CheckCircle2, Circle, ClipboardList, FileText, HelpCircle,
  ChevronRight, Award,
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

      {/* Group by module */}
      {groupByModule(steps).map(({ moduleTitle, moduleIndex, moduleSteps }) => (
        <div key={`mod-${moduleIndex}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400 mb-3 px-1">
            Module {moduleIndex + 1} · {moduleTitle}
          </p>
          <div className="relative pl-1">
            {moduleSteps.map((step, si) => {
              const Icon = ICONS[step.typeIcon]
              const isLast = si === moduleSteps.length - 1
              const href = `/learning/offerings/${offeringId}/lessons/${step.lesson.id}`
              const canOpen = isInstructor || step.status !== 'locked'

              const inner = (
                <div
                  className={cn(
                    'relative flex gap-4 pb-6',
                    !isLast && 'before:absolute before:left-[19px] before:top-10 before:bottom-0 before:w-px',
                    !isLast && (step.status === 'completed' ? 'before:lm-path-line' : 'before:lm-path-line-muted')
                  )}
                >
                  {/* Step node */}
                  <div
                    className={cn(
                      'relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all duration-300',
                      step.status === 'completed' && 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/25',
                      step.status === 'active' && 'bg-brand-700 border-brand-600 text-white shadow-lg shadow-brand-600/30 ring-4 ring-brand-100',
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

                  {/* Step card */}
                  <div
                    className={cn(
                      'flex-1 min-w-0 rounded-2xl border p-4 transition-all duration-200',
                      step.status === 'active' && 'border-brand-200 bg-white shadow-md shadow-brand-600/5',
                      step.status === 'completed' && 'border-slate-200/80 bg-white/60',
                      step.status === 'locked' && 'border-slate-100 bg-slate-50/50 opacity-75',
                      canOpen && step.status !== 'locked' && 'hover:border-brand-200 hover:shadow-sm cursor-pointer'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <LBadge variant={step.status === 'active' ? 'info' : step.status === 'completed' ? 'success' : 'neutral'}>
                            {step.typeLabel}
                          </LBadge>
                          {step.status === 'active' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
                              Current step
                            </span>
                          )}
                        </div>
                        <h3 className={cn(
                          'font-semibold text-slate-900 truncate',
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
                          <p className="text-xs text-emerald-700 mt-2 font-medium flex items-center gap-1 bg-emerald-50 inline-flex px-2 py-1 rounded-lg">
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
