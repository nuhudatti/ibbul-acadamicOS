'use client'

import { useEffect, useState } from 'react'
import { Clock, Loader2, CheckCircle2, XCircle, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { cn } from '@/lib/utils'
import { LButton } from './learning-ui'
import type { QuizStudent } from '@/lib/types'

interface QuizPanelProps {
  quiz: QuizStudent
  onPassed?: () => void
}

export function QuizPanel({ quiz, onPassed }: QuizPanelProps) {
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ score: number; passed: boolean; passing_score: number } | null>(null)
  const [attemptId, setAttemptId] = useState<number | null>(null)
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    learningAPI.startQuiz(quiz.id)
      .then((resp) => setAttemptId(resp.data.id))
      .catch(() => toast.error('Could not start quiz'))
      .finally(() => setStarting(false))
  }, [quiz.id])

  const handleSubmit = async () => {
    const unanswered = (quiz.questions ?? []).filter((q) => answers[String(q.id)] === undefined)
    if (unanswered.length) {
      toast.error('Answer every question before submitting')
      return
    }
    setSubmitting(true)
    try {
      const resp = await learningAPI.submitQuiz(quiz.id, { answers, focus_loss_count: 0 })
      setResult(resp.data)
      if (resp.data.passed) {
        toast.success('Quiz passed — next step unlocked')
        onPassed?.()
      } else {
        toast.error('Not passed — review and try again if attempts remain')
      }
    } catch {
      toast.error('Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (starting) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" /></div>
  }

  if (result) {
    return (
      <div className={cn(
        'rounded-2xl border p-8 text-center',
        result.passed
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
          : 'border-red-200 bg-gradient-to-br from-red-50 to-white'
      )}>
        {result.passed ? (
          <Trophy className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
        ) : (
          <XCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
        )}
        <h3 className="text-xl font-semibold text-slate-900">{result.passed ? 'Quiz passed' : 'Not passed'}</h3>
        <p className="text-sm text-slate-600 mt-2">
          Score <strong>{result.score}%</strong> · Pass mark {result.passing_score}%
        </p>
        {result.passed && (
          <p className="text-xs text-emerald-700 mt-3 font-medium">The next step in your path is now unlocked.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {quiz.time_limit_minutes && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100">
            <Clock className="w-3.5 h-3.5" /> {quiz.time_limit_minutes} min
          </span>
        )}
        <span className="px-2.5 py-1 rounded-full bg-slate-100">Pass: {quiz.passing_score}%</span>
        <span className="px-2.5 py-1 rounded-full bg-slate-100">{quiz.max_attempts} attempts</span>
      </div>
      {quiz.instructions && (
        <p className="text-sm text-slate-600 bg-brand-50/50 rounded-xl p-4 border border-brand-100 leading-relaxed">
          {quiz.instructions}
        </p>
      )}
      {(quiz.questions ?? []).map((q, qi) => (
        <div key={q.id} className="rounded-xl border border-slate-200/80 p-5 bg-white/50">
          <p className="font-medium text-slate-900 mb-4 leading-snug">
            <span className="text-brand-700 font-semibold mr-2">{qi + 1}.</span>
            {q.question_text}
          </p>
          <div className="space-y-2">
            {(q.options ?? []).map((opt, oi) => (
              <label
                key={oi}
                className={cn(
                  'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-200',
                  answers[String(q.id)] === oi
                    ? 'border-brand-300 bg-brand-50 shadow-sm'
                    : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/80'
                )}
              >
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  checked={answers[String(q.id)] === oi}
                  onChange={() => setAnswers((prev) => ({ ...prev, [String(q.id)]: oi }))}
                  className="text-brand-700 accent-brand-700"
                />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <LButton onClick={handleSubmit} disabled={submitting || !attemptId} className="w-full">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        Submit quiz
      </LButton>
    </div>
  )
}
