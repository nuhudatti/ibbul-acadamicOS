'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Clock, Loader2, Shield, ChevronLeft, ChevronRight, Trophy, AlertTriangle,
  Play, HelpCircle, RotateCcw, CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { getLearningApiError } from '@/lib/learning-utils'
import { cn } from '@/lib/utils'
import { LButton } from '../learning-ui'
import { useSecureInput, secureInputProps } from './use-secure-input'
import { useSecureAssessment } from './use-secure-assessment'
import type { QuizStudent, QuizAttempt } from '@/lib/types'

type Phase = 'loading' | 'intro' | 'exam' | 'result' | 'blocked'

interface ExamQuizEngineProps {
  quiz: QuizStudent
  isInstructor?: boolean
  onPassed?: () => void
}

export function ExamQuizEngine({ quiz, isInstructor = false, onPassed }: ExamQuizEngineProps) {
  const questions = quiz.questions ?? []
  const [phase, setPhase] = useState<Phase>('loading')
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [attemptId, setAttemptId] = useState<number | null>(null)
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ score: number; passed: boolean; passing_score: number } | null>(null)
  const [blockReason, setBlockReason] = useState<string | null>(null)
  const submittedRef = useRef(false)
  const handleSubmitRef = useRef<(timedOut?: boolean, autoSubmitted?: boolean) => void>(() => {})
  const draftKey = `lms_quiz_draft_${quiz.id}`

  const secureEnabled = phase === 'exam' && quiz.secure_mode_enabled !== false
  const secure = useSecureAssessment({
    enabled: secureEnabled,
    quizId: quiz.id,
    maxViolations: quiz.max_violations ?? 3,
    onAutoSubmit: () => handleSubmitRef.current(true, true),
  })

  useSecureInput(secureEnabled && !!attemptId)

  const attemptsUsed = attempts.filter((a) => a.status !== 'in_progress').length
  const inProgress = attempts.find((a) => a.status === 'in_progress')
  const passedAttempt = attempts.find((a) => a.passed)
  const attemptsLeft = Math.max(0, quiz.max_attempts - attemptsUsed)

  useEffect(() => {
    if (isInstructor) {
      setPhase('intro')
      return
    }
    learningAPI.getMyAttempts(quiz.id)
      .then((r) => {
        const list: QuizAttempt[] = r.data ?? []
        setAttempts(list)
        const passed = list.find((a) => a.passed)
        const inProg = list.find((a) => a.status === 'in_progress')
        const used = list.filter((a) => a.status !== 'in_progress').length

        if (passed) {
          setResult({
            score: Number(passed.score ?? 0),
            passed: true,
            passing_score: quiz.passing_score,
          })
          setPhase('result')
        } else if (used >= quiz.max_attempts && !inProg) {
          setBlockReason(`You have used all ${quiz.max_attempts} attempt(s). Contact your lecturer if you need help.`)
          setPhase('blocked')
        } else {
          setPhase('intro')
        }
      })
      .catch(() => {
        setPhase('intro')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.id, isInstructor])

  useEffect(() => {
    if (!expiresAt || result || phase !== 'exam') return
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0 && !submittedRef.current) handleSubmitRef.current(true, false)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, result, phase])

  useEffect(() => {
    if (phase === 'exam' && Object.keys(answers).length) {
      localStorage.setItem(draftKey, JSON.stringify(answers))
    }
  }, [answers, draftKey, phase])

  const beginExam = async (resume = false) => {
    if (isInstructor) return
    setStarting(true)
    try {
      if (resume && inProgress) {
        setAttemptId(inProgress.id)
        if (inProgress.expires_at) setExpiresAt(new Date(inProgress.expires_at))
        const saved = localStorage.getItem(draftKey)
        if (saved) {
          try { setAnswers(JSON.parse(saved)) } catch { /* ignore */ }
        }
        setPhase('exam')
        if (quiz.secure_mode_enabled !== false) {
          await secure.enterFullscreen()
        }
        return
      }

      const resp = await learningAPI.startQuiz(quiz.id)
      setAttemptId(resp.data.id)
      if (resp.data.expires_at) setExpiresAt(new Date(resp.data.expires_at))
      const saved = localStorage.getItem(draftKey)
      if (saved) {
        try { setAnswers(JSON.parse(saved)) } catch { /* ignore */ }
      } else {
        setAnswers({})
      }
      setCurrentQ(0)
      setPhase('exam')
      if (quiz.secure_mode_enabled !== false) {
        await secure.enterFullscreen()
      }
    } catch (err) {
      toast.error(getLearningApiError(err, 'Could not start exam'))
    } finally {
      setStarting(false)
    }
  }

  const handleSubmit = useCallback(async (timedOut = false, autoSubmitted = false) => {
    if (submittedRef.current || submitting) return
    if (!timedOut) {
      const unanswered = questions.filter((q) => {
        const val = answers[String(q.id)]
        if (q.question_type === 'short_answer') {
          return !String(val ?? '').trim()
        }
        return val === undefined
      })
      if (unanswered.length) {
        toast.error(`Please answer all ${questions.length} questions before submitting`)
        submittedRef.current = false
        return
      }
    }
    submittedRef.current = true
    setSubmitting(true)
    try {
      const resp = await learningAPI.submitQuiz(quiz.id, {
        answers,
        focus_loss_count: secure.violationCount,
        violations: secure.violations,
        timed_out: timedOut,
        auto_submitted: autoSubmitted || secure.violationCount >= (quiz.max_violations ?? 3),
      })
      setResult(resp.data)
      localStorage.removeItem(draftKey)
      setPhase('result')
      if (resp.data.passed) {
        onPassed?.()
      } else if (timedOut || resp.data.timed_out) {
        toast.info('Time expired — your answers were submitted and graded')
      } else if (autoSubmitted) {
        toast.info('Assessment submitted automatically due to security rules')
      }
    } catch {
      submittedRef.current = false
      toast.error('Submit failed — try again')
    } finally {
      setSubmitting(false)
    }
  }, [answers, questions, quiz.id, quiz.max_violations, draftKey, onPassed, submitting, secure.violationCount, secure.violations])

  useEffect(() => {
    handleSubmitRef.current = handleSubmit
  }, [handleSubmit])

  if (phase === 'loading') {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand-700" />
        <p className="text-sm text-slate-500">Loading exam…</p>
      </div>
    )
  }

  if (isInstructor) {
    return (
      <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-6 space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-brand-700" />
          <p className="font-semibold text-slate-800">Quiz preview (lecturer)</p>
        </div>
        <p className="text-sm text-slate-600">
          Students see instructions first, then tap <strong>Start exam</strong> when ready.
        </p>
        <ul className="text-xs text-slate-500 space-y-1">
          <li>{questions.length} questions · Pass {quiz.passing_score}%</li>
          <li>Time limit: {quiz.time_limit_minutes ? `${quiz.time_limit_minutes} min` : 'None'}</li>
          <li>Max attempts: {quiz.max_attempts}</li>
        </ul>
      </div>
    )
  }

  if (phase === 'blocked') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-slate-900">No attempts remaining</h3>
        <p className="text-sm text-slate-600 mt-2 max-w-sm mx-auto">{blockReason}</p>
      </div>
    )
  }

  if (phase === 'intro') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center">
            <Shield className="w-6 h-6 text-brand-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Before you begin</h3>
            <p className="text-xs text-slate-500">Read carefully, then start when you are ready</p>
          </div>
        </div>

        {quiz.instructions && (
          <p className="text-sm text-slate-700 leading-relaxed p-4 rounded-xl bg-white border border-slate-100 mb-5">
            {quiz.instructions}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl bg-white border border-slate-100 p-3 text-center">
            <p className="text-[10px] uppercase text-slate-400 font-semibold">Questions</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{questions.length}</p>
          </div>
          <div className="rounded-xl bg-white border border-slate-100 p-3 text-center">
            <p className="text-[10px] uppercase text-slate-400 font-semibold">Pass mark</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{quiz.passing_score}%</p>
          </div>
          <div className="rounded-xl bg-white border border-slate-100 p-3 text-center">
            <p className="text-[10px] uppercase text-slate-400 font-semibold">Time limit</p>
            <p className="text-xl font-bold text-slate-800 mt-1">
              {quiz.time_limit_minutes ? `${quiz.time_limit_minutes}m` : 'None'}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-slate-100 p-3 text-center">
            <p className="text-[10px] uppercase text-slate-400 font-semibold">Attempts left</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{attemptsLeft}</p>
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-5 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> Secure assessment — fullscreen, tab switches logged, copy/paste disabled
        </p>

        {questions.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">No questions added yet. Check back later.</p>
        ) : inProgress ? (
          <LButton size="lg" className="w-full sm:w-auto" onClick={() => beginExam(true)} disabled={starting}>
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Resume exam
          </LButton>
        ) : (
          <LButton size="lg" className="w-full sm:w-auto" onClick={() => beginExam(false)} disabled={starting || attemptsLeft === 0}>
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Start exam
          </LButton>
        )}
      </div>
    )
  }

  if (phase === 'result' && result) {
    return (
      <div className={cn(
        'rounded-2xl border p-10 text-center',
        result.passed ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white' : 'border-red-200 bg-red-50/50'
      )}>
        {result.passed ? (
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        ) : (
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        )}
        <h3 className="text-2xl font-semibold text-slate-900">
          {result.passed ? 'Exam passed!' : 'Not passed yet'}
        </h3>
        <p className="text-slate-600 mt-2">
          Score <strong>{result.score}%</strong> · Pass mark {result.passing_score}%
        </p>
        {result.passed ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <p className="text-sm text-emerald-700 font-medium">
              Well done — the next step on your path is now unlocked.
            </p>
          </div>
        ) : attemptsLeft > 0 ? (
          <LButton className="mt-6" variant="secondary" onClick={() => {
            setResult(null)
            submittedRef.current = false
            setPhase('intro')
          }}>
            Try again ({attemptsLeft} left)
          </LButton>
        ) : null}
      </div>
    )
  }

  const q = questions[currentQ]
  if (!q) return <p className="text-sm text-slate-500">No questions in this quiz yet.</p>

  return (
    <div
      className="select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 rounded-xl bg-slate-900 text-white">
        <div className="flex items-center gap-2 text-sm">
          <Shield className="w-4 h-4 text-brand-400" />
          <span>Secure exam in progress</span>
          {secure.violationCount > 0 && (
            <span className="text-amber-400 text-xs">Warnings: {secure.violationCount}/{quiz.max_violations ?? 3}</span>
          )}
        </div>
        {secondsLeft != null && quiz.time_limit_minutes && (
          <div className={cn(
            'flex items-center gap-2 font-mono text-lg font-bold tabular-nums',
            secondsLeft < 60 && 'text-red-400 animate-pulse'
          )}>
            <Clock className="w-5 h-5" />
            {Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, '0')}
          </div>
        )}
        <span className="text-xs text-slate-400">Question {currentQ + 1} of {questions.length}</span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm min-h-[280px]">
        <p className="text-lg font-medium text-slate-900 mb-6 leading-relaxed">{q.question_text}</p>
        {q.question_type === 'short_answer' ? (
          <textarea
            value={String(answers[String(q.id)] ?? '')}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [String(q.id)]: e.target.value }))}
            rows={5}
            placeholder="Type your answer here…"
            className="w-full rounded-xl border border-slate-200 p-4 text-sm text-slate-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-y"
            {...secureInputProps(secureEnabled)}
          />
        ) : (
        <div className="space-y-2">
          {(q.options ?? []).map((opt, oi) => (
            <label
              key={oi}
              className={cn(
                'flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all',
                answers[String(q.id)] === oi
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
              )}
            >
              <input
                type="radio"
                name={`q-${q.id}`}
                checked={answers[String(q.id)] === oi}
                onChange={() => setAnswers((prev) => ({ ...prev, [String(q.id)]: oi }))}
                className="accent-brand-700"
              />
              <span className="text-sm text-slate-800">{opt}</span>
            </label>
          ))}
        </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-6 gap-3">
        <LButton variant="secondary" size="sm" disabled={currentQ === 0} onClick={() => setCurrentQ((c) => c - 1)}>
          <ChevronLeft className="w-4 h-4" /> Previous
        </LButton>
        {currentQ < questions.length - 1 ? (
          <LButton size="sm" onClick={() => setCurrentQ((c) => c + 1)}>
            Next <ChevronRight className="w-4 h-4" />
          </LButton>
        ) : (
          <LButton onClick={() => handleSubmit(false)} disabled={submitting || !attemptId}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            Submit exam
          </LButton>
        )}
      </div>

      <div className="flex gap-1.5 mt-4 flex-wrap">
        {questions.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrentQ(i)}
            className={cn(
              'w-8 h-8 rounded-lg text-xs font-semibold transition-colors',
              i === currentQ ? 'bg-brand-700 text-white' :
              answers[String(questions[i].id)] !== undefined &&
              (questions[i].question_type !== 'short_answer' || String(answers[String(questions[i].id)] ?? '').trim())
                ? 'bg-emerald-100 text-emerald-700' :
              'bg-slate-100 text-slate-500'
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  )
}
