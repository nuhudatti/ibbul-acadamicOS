'use client'

import { useState, useEffect } from 'react'
import {
  Plus, ChevronDown, ChevronUp, Trash2, Loader2,
  HelpCircle, FileText, ClipboardList, FileVideo, BookOpen, Link2,
  Check, Layers, Eye, EyeOff, RefreshCw, KeyRound, Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { getLearningApiError } from '@/lib/learning-utils'
import { MediaDropzone } from './engine/media-dropzone'
import { QuizBuilderPanel } from './quiz-builder-panel'
import { StepCreator } from './step-creator'
import { LCard, LButton, LBadge } from './learning-ui'
import { cn } from '@/lib/utils'
import type { LMSOfferingDetail, Module, Lesson, QuizQuestionInstructor } from '@/lib/types'

const TYPE_STYLES: Record<string, { icon: typeof FileText; label: string; chip: string }> = {
  html: { icon: BookOpen, label: 'Reading', chip: 'bg-slate-100 text-slate-700' },
  video: { icon: FileVideo, label: 'Video', chip: 'bg-gold-100 text-gold-800' },
  pdf: { icon: FileText, label: 'PDF', chip: 'bg-amber-100 text-amber-800' },
  link: { icon: Link2, label: 'Link', chip: 'bg-cyan-100 text-cyan-800' },
  quiz: { icon: HelpCircle, label: 'Quiz', chip: 'bg-emerald-100 text-emerald-800' },
  assignment: { icon: ClipboardList, label: 'Assignment', chip: 'bg-rose-100 text-rose-800' },
}

interface LearningBuilderProps {
  offering: LMSOfferingDetail
  onRefresh: () => void
}

export function LearningBuilder({ offering, onRefresh }: LearningBuilderProps) {
  const [moduleTitle, setModuleTitle] = useState('')
  const [savingModule, setSavingModule] = useState(false)
  const [expandedModule, setExpandedModule] = useState<number | null>(
    offering.modules?.[0]?.id ?? null
  )
  const [addingToModule, setAddingToModule] = useState<number | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [pinDraft, setPinDraft] = useState(offering.enrollment_pin ?? '')
  const [savingPin, setSavingPin] = useState(false)
  const [showPin, setShowPin] = useState(false)

  const modules = [...(offering.modules ?? [])].sort((a, b) => a.order - b.order)
  const totalSteps = modules.reduce((n, m) => n + (m.lessons?.length ?? 0), 0)

  useEffect(() => {
    setPinDraft(offering.enrollment_pin ?? '')
  }, [offering.enrollment_pin])

  const addModule = async () => {
    if (!moduleTitle.trim()) return
    setSavingModule(true)
    try {
      await learningAPI.createModule({
        offering: offering.id,
        title: moduleTitle.trim(),
        order: modules.length,
      })
      setModuleTitle('')
      toast.success('Module added')
      onRefresh()
    } catch (err) {
      toast.error(getLearningApiError(err, 'Failed to add module'))
    } finally {
      setSavingModule(false)
    }
  }

  const togglePublish = async () => {
    setPublishing(true)
    try {
      await learningAPI.updateOffering(offering.id, {
        is_published: !offering.is_published,
        enrollment_open: true,
      })
      toast.success(offering.is_published ? 'Course unpublished — hidden from catalog' : 'Published — students can enroll')
      onRefresh()
    } catch {
      toast.error('Failed to update')
    } finally {
      setPublishing(false)
    }
  }

  const savePin = async (newPin?: string) => {
    const pin = (newPin ?? pinDraft).trim()
    if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
      toast.error('PIN must be exactly 4 digits')
      return
    }
    setSavingPin(true)
    try {
      await learningAPI.updateOffering(offering.id, { enrollment_pin: pin })
      toast.success(pin ? 'Enrollment PIN updated' : 'PIN removed — open enrollment')
      onRefresh()
    } catch {
      toast.error('Failed to update PIN')
    } finally {
      setSavingPin(false)
    }
  }

  const regeneratePin = () => {
    const pin = String(Math.floor(1000 + Math.random() * 9000))
    setPinDraft(pin)
    savePin(pin)
  }

  const copyPin = () => {
    if (!pinDraft) return
    navigator.clipboard.writeText(pinDraft)
    toast.success('PIN copied — share with enrolled students only')
  }

  return (
    <div className="space-y-6">
      {/* Studio control bar — solid brand header, no overlap with page shell */}
      <div className="rounded-2xl overflow-hidden border border-brand-700/20 shadow-sm">
        <div className="bg-brand-800 px-5 py-5 sm:px-6 text-white">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-200 mb-1">
                Course studio
              </p>
              <p className="text-lg font-semibold leading-snug">
                {offering.is_published ? 'Live in catalog' : 'Draft — build then publish'}
              </p>
              <p className="text-sm text-brand-100/90 mt-1">
                {modules.length} modules · {totalSteps} steps · sequential unlock
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <LBadge variant={offering.is_published ? 'live' : 'warning'} dot className="!bg-white/15 !text-white !border-white/20">
                {offering.is_published ? 'Published' : 'Draft'}
              </LBadge>
              {offering.is_published ? (
                <LButton
                  variant="secondary"
                  onClick={togglePublish}
                  disabled={publishing}
                  className="!bg-white/10 !text-white !border-white/25 hover:!bg-white/20"
                >
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />}
                  Unpublish
                </LButton>
              ) : (
                <LButton
                  onClick={togglePublish}
                  disabled={publishing || totalSteps === 0}
                  className="!bg-gold-500 !text-brand-900 hover:!bg-gold-400 !border-0 font-bold"
                  title={totalSteps === 0 ? 'Add at least one step before publishing' : undefined}
                >
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  Publish course
                </LButton>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white px-5 py-4 sm:px-6 border-t border-brand-100 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-brand-600" />
              Enrollment PIN
            </p>
            <p className="text-xs text-slate-500 mb-2">
              Students enter this 4-digit code before enrolling — keeps the wrong class out.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  className="w-28 h-10 px-3 rounded-xl border border-slate-200 text-sm font-mono tracking-widest focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <LButton size="sm" variant="secondary" onClick={() => savePin()} disabled={savingPin}>
                {savingPin ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save PIN'}
              </LButton>
              <LButton size="sm" variant="ghost" onClick={regeneratePin} disabled={savingPin}>
                <RefreshCw className="w-3.5 h-3.5" /> New code
              </LButton>
              <LButton size="sm" variant="ghost" onClick={copyPin} disabled={!pinDraft}>
                <Copy className="w-3.5 h-3.5" /> Copy
              </LButton>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{totalSteps}</p>
              <p className="text-xs text-slate-500">Learning steps</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add module */}
      <LCard>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">New module</p>
        <div className="flex gap-2">
          <input
            value={moduleTitle}
            onChange={(e) => setModuleTitle(e.target.value)}
            placeholder="e.g. Week 1 — Foundations"
            className="flex-1 h-11 px-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            onKeyDown={(e) => e.key === 'Enter' && addModule()}
          />
          <LButton onClick={addModule} disabled={savingModule || !moduleTitle.trim()}>
            {savingModule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add module
          </LButton>
        </div>
      </LCard>

      {modules.length === 0 ? (
        <LCard className="text-center py-20 border-dashed border-2 border-brand-100 bg-brand-50/20">
          <Layers className="w-10 h-10 text-brand-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">Start building your course</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Add a module, then add readings, videos, PDFs, quizzes, and assignments — one step at a time.
          </p>
        </LCard>
      ) : (
        modules.map((mod, mi) => (
          <ModuleBlock
            key={mod.id}
            mod={mod}
            moduleIndex={mi}
            expanded={expandedModule === mod.id}
            onToggle={() => setExpandedModule(expandedModule === mod.id ? null : mod.id)}
            adding={addingToModule === mod.id}
            onStartAdd={() => setAddingToModule(mod.id)}
            onCancelAdd={() => setAddingToModule(null)}
            onRefresh={onRefresh}
          />
        ))
      )}
    </div>
  )
}

function ModuleBlock({
  mod,
  moduleIndex,
  expanded,
  onToggle,
  adding,
  onStartAdd,
  onCancelAdd,
  onRefresh,
}: {
  mod: Module
  moduleIndex: number
  expanded: boolean
  onToggle: () => void
  adding: boolean
  onStartAdd: () => void
  onCancelAdd: () => void
  onRefresh: () => void
}) {
  const lessons = [...(mod.lessons ?? [])].sort((a, b) => a.order - b.order)
  const [expandedLesson, setExpandedLesson] = useState<number | null>(null)

  return (
    <LCard padding="none" className="overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 text-white text-sm font-bold flex items-center justify-center shadow-sm">
            {moduleIndex + 1}
          </span>
          <div>
            <p className="font-semibold text-slate-900">{mod.title}</p>
            <p className="text-xs text-slate-400 mt-0.5">{lessons.length} steps · sequential unlock</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-2">
          {lessons.map((lesson, li) => (
            <StepRow
              key={lesson.id}
              lesson={lesson}
              stepNum={li + 1}
              expanded={expandedLesson === lesson.id}
              onToggle={() => setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)}
              onRefresh={onRefresh}
            />
          ))}

          {adding ? (
            <StepCreator
              moduleId={mod.id}
              order={lessons.length}
              onDone={() => { onCancelAdd(); onRefresh() }}
              onCancel={onCancelAdd}
            />
          ) : (
            <button
              type="button"
              onClick={onStartAdd}
              className="w-full h-12 rounded-2xl border-2 border-dashed border-brand-200 text-sm font-semibold text-brand-700 hover:bg-brand-50/60 hover:border-brand-400 transition-all flex items-center justify-center gap-2 mt-2"
            >
              <Plus className="w-4 h-4" /> Add learning step
            </button>
          )}
        </div>
      )}
    </LCard>
  )
}

function StepRow({
  lesson,
  stepNum,
  expanded,
  onToggle,
  onRefresh,
}: {
  lesson: Lesson
  stepNum: number
  expanded: boolean
  onToggle: () => void
  onRefresh: () => void
}) {
  const style = TYPE_STYLES[lesson.content_type] ?? TYPE_STYLES.html
  const Icon = style.icon
  const [deleting, setDeleting] = useState(false)

  const remove = async () => {
    if (!confirm('Delete this step from the learning path?')) return
    setDeleting(true)
    try {
      await learningAPI.deleteLesson(lesson.id)
      toast.success('Step removed')
      onRefresh()
    } catch {
      toast.error('Could not delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden transition-shadow',
      expanded ? 'border-brand-200 shadow-md shadow-brand-100/30 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 text-left"
      >
        <span className="w-7 h-7 rounded-lg bg-slate-100 text-xs font-bold text-slate-600 flex items-center justify-center flex-shrink-0">
          {stepNum}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{lesson.title}</p>
          <span className={cn('inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide', style.chip)}>
            <Icon className="w-3 h-3" />
            {style.label}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-4 bg-slate-50/30">
          {lesson.content_type === 'quiz' && lesson.quiz ? (
            <QuizBuilderPanel
              quizId={lesson.quiz.id}
              quizTitle={lesson.quiz.title}
              passingScore={lesson.quiz.passing_score}
              timeLimitMinutes={lesson.quiz.time_limit_minutes}
              maxAttempts={lesson.quiz.max_attempts}
              instructions={lesson.quiz.instructions}
              initialQuestions={(lesson.quiz as { questions?: QuizQuestionInstructor[] }).questions ?? []}
              onRefresh={onRefresh}
            />
          ) : lesson.content_type === 'assignment' && lesson.assignment ? (
            <AssignmentEditor lesson={lesson} assignment={lesson.assignment} onRefresh={onRefresh} />
          ) : (
            <LessonEditor lesson={lesson} onRefresh={onRefresh} />
          )}
          <div className="flex justify-end pt-2 border-t border-slate-200/80">
            <LButton variant="danger" size="sm" onClick={remove} disabled={deleting}>
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete step
            </LButton>
          </div>
        </div>
      )}
    </div>
  )
}

function LessonEditor({ lesson, onRefresh }: { lesson: Lesson; onRefresh: () => void }) {
  const [title, setTitle] = useState(lesson.title)
  const [body, setBody] = useState(lesson.content_body || '')
  const [url, setUrl] = useState(lesson.external_url || '')
  const [saving, setSaving] = useState(false)
  const style = TYPE_STYLES[lesson.content_type] ?? TYPE_STYLES.html

  const save = async () => {
    setSaving(true)
    try {
      await learningAPI.updateLesson(lesson.id, {
        title: title.trim(),
        content_body: body,
        external_url: url,
      })
      toast.success('Saved')
      onRefresh()
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold', style.chip)}>
        Editing {style.label} step
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-600">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
        />
      </div>

      {lesson.content_type === 'video' && (
        <>
          <MediaDropzone lessonId={lesson.id} kind="video" onUploaded={onRefresh} />
          <div>
            <label className="text-xs font-semibold text-slate-600">Or video URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="YouTube or direct link"
              className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
            />
          </div>
        </>
      )}

      {lesson.content_type === 'pdf' && (
        <>
          <MediaDropzone lessonId={lesson.id} kind="pdf" onUploaded={onRefresh} />
          <div>
            <label className="text-xs font-semibold text-slate-600">Or PDF URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/file.pdf"
              className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
            />
          </div>
        </>
      )}

      {lesson.content_type === 'link' && (
        <div>
          <label className="text-xs font-semibold text-slate-600">External URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
          />
        </div>
      )}

      {(lesson.content_type === 'html' || lesson.content_body) && (
        <div>
          <label className="text-xs font-semibold text-slate-600">Content</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
          />
        </div>
      )}

      <LButton size="sm" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Save changes
      </LButton>
    </div>
  )
}

function AssignmentEditor({
  lesson,
  assignment,
  onRefresh,
}: {
  lesson: Lesson
  assignment: NonNullable<Lesson['assignment']>
  onRefresh: () => void
}) {
  const [title, setTitle] = useState(assignment.title)
  const [desc, setDesc] = useState(assignment.description || '')
  const [maxScore, setMaxScore] = useState(assignment.max_score ?? 100)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await learningAPI.updateLesson(lesson.id, { title: title.trim() })
      await learningAPI.updateAssignment(assignment.id, {
        title: title.trim(),
        description: desc,
        max_score: maxScore,
      })
      toast.success('Assignment saved')
      onRefresh()
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-100 text-rose-800">
        Editing assignment
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-600">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-600">Instructions</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={5}
          placeholder="What should students submit?"
          className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
        />
      </div>
      <div className="w-32">
        <label className="text-xs font-semibold text-slate-600">Max score</label>
        <input
          type="number"
          min={1}
          value={maxScore}
          onChange={(e) => setMaxScore(Number(e.target.value))}
          className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
        />
      </div>
      <LButton size="sm" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Save assignment
      </LButton>
    </div>
  )
}
