'use client'

import { useState } from 'react'
import {
  Plus, Loader2, ArrowLeft, BookOpen, FileVideo, FileText, Link2,
  HelpCircle, ClipboardList, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { uploadLessonMediaFile } from '@/lib/cloudinary-upload'
import { getLearningApiError } from '@/lib/learning-utils'
import { MediaFilePicker } from './engine/media-dropzone'
import { LCard, LButton } from './learning-ui'
import { cn } from '@/lib/utils'
import type { ContentType } from '@/lib/types'

const STEP_TYPES: {
  value: ContentType
  label: string
  desc: string
  icon: typeof BookOpen
  accent: string
}[] = [
  { value: 'html', label: 'Reading', desc: 'Text lesson with live follow-along', icon: BookOpen, accent: 'from-slate-500 to-slate-600' },
  { value: 'video', label: 'Video', desc: 'Upload or link a lecture recording', icon: FileVideo, accent: 'from-brand-600 to-brand-700' },
  { value: 'pdf', label: 'PDF', desc: 'Document students read page by page', icon: FileText, accent: 'from-amber-500 to-orange-600' },
  { value: 'link', label: 'External link', desc: 'Send students to a web resource', icon: Link2, accent: 'from-cyan-500 to-blue-600' },
  { value: 'quiz', label: 'Quiz (CBT)', desc: 'Timed multiple-choice assessment', icon: HelpCircle, accent: 'from-emerald-500 to-teal-600' },
  { value: 'assignment', label: 'Assignment', desc: 'Written work with secure submission', icon: ClipboardList, accent: 'from-rose-500 to-pink-600' },
]

interface QuestionDraft {
  text: string
  options: string[]
  correct: number
}

export function StepCreator({
  moduleId,
  order,
  onDone,
  onCancel,
}: {
  moduleId: number
  order: number
  onDone: () => void
  onCancel: () => void
}) {
  const [stepType, setStepType] = useState<ContentType | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [passingScore, setPassingScore] = useState(50)
  const [timeLimit, setTimeLimit] = useState<number | ''>(15)
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [quizInstructions, setQuizInstructions] = useState('Answer all questions. You must pass to unlock the next step.')
  const [maxScore, setMaxScore] = useState(100)
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    { text: '', options: ['', ''], correct: 0 },
  ])
  const [submitting, setSubmitting] = useState(false)

  const selected = STEP_TYPES.find((t) => t.value === stepType)

  const addQuestion = () => {
    setQuestions((q) => [...q, { text: '', options: ['', ''], correct: 0 }])
  }

  const submit = async () => {
    if (!stepType) {
      toast.error('Choose what you want to add')
      return
    }
    if (!title.trim()) {
      toast.error('Enter a title for this step')
      return
    }
    if (stepType === 'video' && !mediaFile && !url.trim()) {
      toast.error('Upload a video file or paste a video URL')
      return
    }
    if (stepType === 'pdf' && !mediaFile && !url.trim()) {
      toast.error('Upload a PDF file or paste a PDF link')
      return
    }
    if (stepType === 'link' && !url.trim()) {
      toast.error('Enter the external link URL')
      return
    }

    setSubmitting(true)
    try {
      const resp = await learningAPI.createLesson({
        module: moduleId,
        title: title.trim(),
        content_type: stepType,
        content_body: body,
        external_url: url.trim() || undefined,
        order,
        is_published: true,
      })
      const lessonId = resp.data?.id as number | undefined

      if (lessonId && mediaFile && ['video', 'pdf'].includes(stepType)) {
        await uploadLessonMediaFile(lessonId, mediaFile)
      }

      if (stepType === 'quiz' && lessonId) {
        const quizResp = await learningAPI.createQuiz({
          lesson: lessonId,
          title: `${title.trim()} Quiz`,
          passing_score: passingScore,
          max_attempts: maxAttempts,
          time_limit_minutes: timeLimit === '' ? null : Number(timeLimit),
          instructions: quizInstructions.trim() || undefined,
        })
        const quizId = quizResp.data?.id
        if (quizId) {
          for (let i = 0; i < questions.length; i++) {
            const q = questions[i]
            if (!q.text.trim() || q.options.filter((o) => o.trim()).length < 2) continue
            await learningAPI.addQuestion(quizId, {
              question_text: q.text.trim(),
              options: q.options.filter((o) => o.trim()),
              correct_index: q.correct,
              points: 1,
              order: i,
            })
          }
        }
      }

      if (stepType === 'assignment' && lessonId) {
        await learningAPI.createAssignment({
          lesson: lessonId,
          title: title.trim(),
          description: body.trim() || 'Complete this assignment to continue.',
          max_score: maxScore,
        })
      }

      toast.success('Step added to your learning path')
      onDone()
    } catch (err) {
      toast.error(getLearningApiError(err, 'Failed to create step'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!stepType) {
    return (
      <LCard className="!p-0 border-brand-200 overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-r from-brand-700 to-brand-700 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 opacity-90" />
            <p className="text-sm font-semibold">Add a learning step</p>
          </div>
          <p className="text-xs text-brand-100 mt-1">What are you adding to the path? Pick one — the form adapts to your choice.</p>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STEP_TYPES.map((opt) => {
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStepType(opt.value)}
                className="group text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-md hover:shadow-brand-100/50 transition-all duration-200"
              >
                <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br text-white flex items-center justify-center mb-3 shadow-sm', opt.accent)}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900 group-hover:text-brand-800">{opt.label}</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{opt.desc}</p>
              </button>
            )
          })}
        </div>
        <div className="px-4 pb-4">
          <LButton variant="secondary" onClick={onCancel} className="w-full">Cancel</LButton>
        </div>
      </LCard>
    )
  }

  const SelectedIcon = selected!.icon

  return (
    <LCard className="!p-0 border-brand-200 overflow-hidden">
      {/* Type banner */}
      <div className={cn('px-5 py-4 bg-gradient-to-r text-white flex items-start justify-between gap-3', selected!.accent)}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <SelectedIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Adding: {selected!.label}</p>
            <p className="text-xs text-white/80 mt-0.5">{selected!.desc}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setStepType(null); setMediaFile(null) }}
          className="text-xs font-medium text-white/90 hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/10"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Change type
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Step title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              stepType === 'quiz' ? 'e.g. Week 2 Knowledge Check' :
              stepType === 'assignment' ? 'e.g. Lab Report Submission' :
              stepType === 'video' ? 'e.g. Lecture 3 — Data Structures' :
              'e.g. Introduction to the course'
            }
            className="mt-1.5 w-full h-11 px-4 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            autoFocus
          />
        </div>

        {stepType === 'html' && (
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Reading content</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Write your lesson here. Basic HTML is supported for headings and lists."
              className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        )}

        {stepType === 'video' && (
          <div className="space-y-4">
            <MediaFilePicker kind="video" file={mediaFile} onFile={setMediaFile} />
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Or paste a video URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtube.com/… or direct MP4 link"
                className="mt-1.5 w-full h-10 px-4 rounded-xl border border-slate-200 text-sm bg-white"
              />
              <p className="text-[11px] text-slate-400 mt-1">Optional if you uploaded a file above</p>
            </div>
          </div>
        )}

        {stepType === 'pdf' && (
          <div className="space-y-4">
            <MediaFilePicker kind="pdf" file={mediaFile} onFile={setMediaFile} />
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Or paste a PDF URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…/document.pdf"
                className="mt-1.5 w-full h-10 px-4 rounded-xl border border-slate-200 text-sm bg-white"
              />
            </div>
          </div>
        )}

        {stepType === 'link' && (
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Resource URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1.5 w-full h-10 px-4 rounded-xl border border-slate-200 text-sm bg-white"
            />
          </div>
        )}

        {stepType === 'quiz' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Time limit (min)</label>
                <input
                  type="number"
                  min={0}
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="∞"
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Leave empty for no limit</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Pass mark %</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={passingScore}
                  onChange={(e) => setPassingScore(Number(e.target.value))}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Max attempts</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(Number(e.target.value))}
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Instructions for students</label>
              <textarea
                value={quizInstructions}
                onChange={(e) => setQuizInstructions(e.target.value)}
                rows={2}
                className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" /> Questions — mark the correct answer
              </p>
              {questions.map((q, qi) => (
                <div key={qi} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                  <input
                    value={q.text}
                    onChange={(e) => {
                      const next = [...questions]
                      next[qi] = { ...q, text: e.target.value }
                      setQuestions(next)
                    }}
                    placeholder={`Question ${qi + 1}`}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                  />
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${qi}`}
                        checked={q.correct === oi}
                        onChange={() => {
                          const next = [...questions]
                          next[qi] = { ...q, correct: oi }
                          setQuestions(next)
                        }}
                        title="Correct answer"
                        className="accent-emerald-600"
                      />
                      <input
                        value={opt}
                        onChange={(e) => {
                          const next = [...questions]
                          const opts = [...q.options]
                          opts[oi] = e.target.value
                          next[qi] = { ...q, options: opts }
                          setQuestions(next)
                        }}
                        placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                        className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...questions]
                      next[qi] = { ...q, options: [...q.options, ''] }
                      setQuestions(next)
                    }}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    + Add option
                  </button>
                </div>
              ))}
              <button type="button" onClick={addQuestion} className="text-sm text-brand-700 font-medium">
                + Add another question
              </button>
            </div>
          </div>
        )}

        {stepType === 'assignment' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Instructions</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder="Tell students exactly what to submit, format, word count, deadline notes…"
                className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-white"
              />
            </div>
            <div className="w-40">
              <label className="text-xs font-semibold text-slate-600">Max score</label>
              <input
                type="number"
                min={1}
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <LButton variant="secondary" onClick={onCancel} className="flex-1">Cancel</LButton>
          <LButton onClick={submit} disabled={submitting} className="flex-1">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add to path
          </LButton>
        </div>
      </div>
    </LCard>
  )
}
