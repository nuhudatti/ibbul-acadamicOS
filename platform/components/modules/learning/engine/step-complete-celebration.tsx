'use client'

import Link from 'next/link'
import { CheckCircle2, ChevronRight, Sparkles, PartyPopper } from 'lucide-react'
import { LButton } from '../learning-ui'
import type { Lesson } from '@/lib/types'

const TYPE_LABELS: Record<string, string> = {
  html: 'Reading',
  video: 'Video',
  pdf: 'PDF',
  link: 'Resource',
  quiz: 'Quiz',
  assignment: 'Assignment',
}

export function StepCompleteCelebration({
  stepTitle,
  stepType,
  nextLesson,
  offeringId,
  message,
  onDismiss,
}: {
  stepTitle: string
  stepType?: string
  nextLesson: Lesson | null
  offeringId: number
  message?: string
  onDismiss?: () => void
}) {
  const typeLabel = stepType ? TYPE_LABELS[stepType] ?? 'Step' : 'Step'

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-brand-50/40 p-8 text-center shadow-lg shadow-emerald-500/10">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4 ring-4 ring-emerald-50">
        <CheckCircle2 className="w-9 h-9 text-emerald-600" />
      </div>

      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600 mb-2 flex items-center justify-center gap-1.5">
        <PartyPopper className="w-3.5 h-3.5" /> Step complete
      </p>

      <h2 className="text-xl font-semibold text-slate-900">{stepTitle}</h2>
      <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
        {message ?? `Great work — you finished this ${typeLabel.toLowerCase()}. Take a breath; your progress is saved.`}
      </p>

      {nextLesson ? (
        <div className="mt-6 rounded-xl bg-white/80 border border-emerald-100 px-5 py-4 max-w-md mx-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-brand-600" /> Up next — now unlocked
          </p>
          <p className="text-sm font-semibold text-brand-900">{nextLesson.title}</p>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">{nextLesson.content_type.replace('_', ' ')}</p>
        </div>
      ) : (
        <div className="mt-6 rounded-xl bg-white/80 border border-emerald-100 px-5 py-4 max-w-md mx-auto">
          <p className="text-sm font-semibold text-emerald-800">You reached the end of this path section</p>
          <p className="text-xs text-slate-500 mt-1">View your full learning path to see what is left.</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
        {nextLesson ? (
          <Link href={`/learning/offerings/${offeringId}/lessons/${nextLesson.id}`}>
            <LButton size="lg" onClick={onDismiss}>
              Continue to next step <ChevronRight className="w-4 h-4" />
            </LButton>
          </Link>
        ) : (
          <Link href={`/learning/offerings/${offeringId}`}>
            <LButton size="lg" onClick={onDismiss}>
              View learning path <ChevronRight className="w-4 h-4" />
            </LButton>
          </Link>
        )}
        <Link href={`/learning/offerings/${offeringId}`}>
          <LButton variant="secondary" size="lg" onClick={onDismiss}>
            Back to path
          </LButton>
        </Link>
      </div>
    </div>
  )
}
