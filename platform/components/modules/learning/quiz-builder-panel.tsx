'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, HelpCircle, Clock, Target, RotateCcw, Check } from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import type { QuizQuestionInstructor } from '@/lib/types'
import { LButton } from './learning-ui'

interface QuizBuilderPanelProps {
  quizId: number
  quizTitle: string
  passingScore?: number
  timeLimitMinutes?: number | null
  maxAttempts?: number
  instructions?: string
  secureModeEnabled?: boolean
  maxViolations?: number
  initialQuestions?: QuizQuestionInstructor[]
  onRefresh: () => void
}

export function QuizBuilderPanel({
  quizId,
  quizTitle,
  passingScore = 50,
  timeLimitMinutes = null,
  maxAttempts = 3,
  instructions = '',
  secureModeEnabled = true,
  maxViolations = 3,
  initialQuestions = [],
  onRefresh,
}: QuizBuilderPanelProps) {
  const [questions, setQuestions] = useState<QuizQuestionInstructor[]>(initialQuestions)
  const [newQ, setNewQ] = useState({
    text: '', options: ['', ''], correct: 0,
    type: 'mcq' as 'mcq' | 'short_answer', modelAnswer: '',
  })
  const [adding, setAdding] = useState(false)
  const [settings, setSettings] = useState({
    passing_score: passingScore,
    time_limit_minutes: timeLimitMinutes ?? '' as number | '',
    max_attempts: maxAttempts,
    instructions,
    secure_mode_enabled: secureModeEnabled,
    max_violations: maxViolations,
  })
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    setQuestions(initialQuestions)
  }, [initialQuestions])

  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      passing_score: passingScore,
      time_limit_minutes: timeLimitMinutes ?? '',
      max_attempts: maxAttempts,
      instructions,
      secure_mode_enabled: secureModeEnabled,
      max_violations: maxViolations,
    }))
  }, [passingScore, timeLimitMinutes, maxAttempts, instructions, secureModeEnabled, maxViolations])

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      await learningAPI.updateQuiz(quizId, {
        passing_score: settings.passing_score,
        max_attempts: settings.max_attempts,
        time_limit_minutes: settings.time_limit_minutes === '' ? null : Number(settings.time_limit_minutes),
        instructions: settings.instructions.trim() || '',
        secure_mode_enabled: settings.secure_mode_enabled,
        max_violations: settings.max_violations,
      })
      toast.success('Quiz settings saved')
      onRefresh()
    } catch {
      toast.error('Could not save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const addQuestion = async () => {
    if (!newQ.text.trim()) {
      toast.error('Question text is required')
      return
    }
    if (newQ.type === 'mcq' && newQ.options.filter((o) => o.trim()).length < 2) {
      toast.error('MCQ needs at least 2 options')
      return
    }
    setAdding(true)
    try {
      const resp = await learningAPI.addQuestion(quizId, {
        question_text: newQ.text.trim(),
        question_type: newQ.type,
        options: newQ.type === 'mcq' ? newQ.options.filter((o) => o.trim()) : [],
        correct_index: newQ.type === 'mcq' ? newQ.correct : 0,
        model_answer: newQ.type === 'short_answer' ? newQ.modelAnswer.trim() : '',
        points: 1,
        order: questions.length,
      })
      setQuestions((prev) => [...prev, resp.data])
      setNewQ({ text: '', options: ['', ''], correct: 0, type: 'mcq', modelAnswer: '' })
      toast.success('Question added')
      onRefresh()
    } catch {
      toast.error('Failed to add question')
    } finally {
      setAdding(false)
    }
  }

  const removeQuestion = async (id: number) => {
    try {
      await learningAPI.deleteQuestion(id)
      setQuestions((prev) => prev.filter((q) => q.id !== id))
      toast.success('Question removed')
      onRefresh()
    } catch {
      toast.error('Could not delete')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <HelpCircle className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{quizTitle}</p>
          <p className="text-xs text-slate-400">{questions.length} questions · CBT mode</p>
        </div>
      </div>

      {/* Quiz settings */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
        <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Exam settings</p>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 flex items-center gap-1 mb-1">
              <Clock className="w-3 h-3" /> Time (min)
            </span>
            <input
              type="number"
              min={0}
              value={settings.time_limit_minutes}
              onChange={(e) => setSettings({
                ...settings,
                time_limit_minutes: e.target.value === '' ? '' : Number(e.target.value),
              })}
              placeholder="∞"
              className="w-full h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 flex items-center gap-1 mb-1">
              <Target className="w-3 h-3" /> Pass %
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.passing_score}
              onChange={(e) => setSettings({ ...settings, passing_score: Number(e.target.value) })}
              className="w-full h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 flex items-center gap-1 mb-1">
              <RotateCcw className="w-3 h-3" /> Attempts
            </span>
            <input
              type="number"
              min={1}
              max={10}
              value={settings.max_attempts}
              onChange={(e) => setSettings({ ...settings, max_attempts: Number(e.target.value) })}
              className="w-full h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white"
            />
          </label>
        </div>
        <textarea
          value={settings.instructions}
          onChange={(e) => setSettings({ ...settings, instructions: e.target.value })}
          rows={2}
          placeholder="Instructions shown before the quiz starts"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.secure_mode_enabled}
              onChange={(e) => setSettings({ ...settings, secure_mode_enabled: e.target.checked })}
            />
            Secure assessment mode
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Max violations
            <input
              type="number"
              min={1}
              max={10}
              value={settings.max_violations}
              onChange={(e) => setSettings({ ...settings, max_violations: Number(e.target.value) })}
              className="w-16 h-8 px-2 rounded border border-slate-200"
            />
          </label>
        </div>
        <LButton size="sm" onClick={saveSettings} disabled={savingSettings}>
          {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save exam settings
        </LButton>
      </div>

      {questions.map((q, qi) => (
        <div key={q.id ?? qi} className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex justify-between gap-2">
            <p className="text-sm text-slate-800">
              <span className="text-emerald-600 font-bold">Q{qi + 1}.</span> {q.question_text}
              {q.question_type === 'short_answer' && (
                <span className="ml-2 text-[10px] font-semibold text-brand-700 uppercase">Short answer</span>
              )}
            </p>
            {q.id && (
              <button type="button" onClick={() => removeQuestion(q.id)} className="text-slate-400 hover:text-red-500 p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <ul className="mt-2 space-y-1">
            {q.question_type === 'short_answer' ? (
              <li className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-800 border border-brand-100">
                Model: {q.model_answer || '(lecturer grades manually)'}
              </li>
            ) : q.options.map((opt, oi) => (
              <li
                key={oi}
                className={`text-xs px-2.5 py-1.5 rounded-lg ${
                  oi === q.correct_index ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'text-slate-600 bg-slate-50'
                }`}
              >
                {String.fromCharCode(65 + oi)}. {opt}
                {oi === q.correct_index && (
                  <span className="ml-2 text-[10px] font-bold text-emerald-600">CORRECT</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="rounded-2xl border border-brand-200 bg-brand-50/30 p-4 space-y-3">
        <p className="text-xs font-semibold text-brand-800 uppercase tracking-wider">Add question</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setNewQ({ ...newQ, type: 'mcq' })}
            className={`text-xs px-3 py-1.5 rounded-lg border ${newQ.type === 'mcq' ? 'bg-brand-700 text-white border-brand-700' : 'bg-white border-slate-200'}`}
          >
            Multiple choice
          </button>
          <button
            type="button"
            onClick={() => setNewQ({ ...newQ, type: 'short_answer' })}
            className={`text-xs px-3 py-1.5 rounded-lg border ${newQ.type === 'short_answer' ? 'bg-brand-700 text-white border-brand-700' : 'bg-white border-slate-200'}`}
          >
            Short answer
          </button>
        </div>
        <input
          value={newQ.text}
          onChange={(e) => setNewQ({ ...newQ, text: e.target.value })}
          placeholder="Question text"
          className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
        />
        {newQ.type === 'short_answer' ? (
          <input
            value={newQ.modelAnswer}
            onChange={(e) => setNewQ({ ...newQ, modelAnswer: e.target.value })}
            placeholder="Model answer (for auto/similarity grading)"
            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
          />
        ) : (
        <>
        {newQ.options.map((opt, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <input
              type="radio"
              name="new-correct"
              checked={newQ.correct === oi}
              onChange={() => setNewQ({ ...newQ, correct: oi })}
              className="accent-emerald-600"
              title="Mark as correct answer"
            />
            <input
              value={opt}
              onChange={(e) => {
                const opts = [...newQ.options]
                opts[oi] = e.target.value
                setNewQ({ ...newQ, options: opts })
              }}
              placeholder={`Option ${String.fromCharCode(65 + oi)}`}
              className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setNewQ({ ...newQ, options: [...newQ.options, ''] })}
          className="text-xs text-brand-700 hover:underline"
        >
          + Add option
        </button>
        </>
        )}
        <LButton size="sm" onClick={addQuestion} disabled={adding}>
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add question
        </LButton>
      </div>
    </div>
  )
}
