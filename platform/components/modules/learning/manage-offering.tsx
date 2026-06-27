'use client'

import { useState } from 'react'
import { Plus, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { LMSOfferingDetail, Module, Lesson } from '@/lib/types'

const CONTENT_TYPES = [
  { value: 'video', label: 'Video' },
  { value: 'pdf', label: 'PDF' },
  { value: 'html', label: 'HTML / Text' },
  { value: 'link', label: 'External link' },
  { value: 'quiz', label: 'Quiz (CBT)' },
  { value: 'assignment', label: 'Assignment' },
]

interface ManageOfferingProps {
  offering: LMSOfferingDetail
  onRefresh: () => void
}

export function ManageOffering({ offering, onRefresh }: ManageOfferingProps) {
  const [moduleTitle, setModuleTitle] = useState('')
  const [savingModule, setSavingModule] = useState(false)
  const [expandedModule, setExpandedModule] = useState<number | null>(null)
  const [lessonForms, setLessonForms] = useState<Record<number, {
    title: string
    content_type: string
    content_body: string
    external_url: string
  }>>({})
  const [publishing, setPublishing] = useState(false)

  const modules = offering.modules ?? []

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
    } catch {
      toast.error('Failed to add module')
    } finally {
      setSavingModule(false)
    }
  }

  const addLesson = async (moduleId: number) => {
    const form = lessonForms[moduleId] ?? { title: '', content_type: 'html', content_body: '', external_url: '' }
    if (!form.title.trim()) {
      toast.error('Lesson title required')
      return
    }
    try {
      const mod = modules.find((m) => m.id === moduleId)
      const resp = await learningAPI.createLesson({
        module: moduleId,
        title: form.title.trim(),
        content_type: form.content_type,
        content_body: form.content_body,
        external_url: form.external_url,
        order: mod?.lessons?.length ?? 0,
        is_published: true,
      })
      const lessonId = resp.data?.id
      if (form.content_type === 'quiz' && lessonId) {
        await learningAPI.createQuiz({
          lesson: lessonId,
          title: `${form.title.trim()} Quiz`,
          passing_score: 50,
          max_attempts: 3,
        })
      }
      if (form.content_type === 'assignment' && lessonId) {
        await learningAPI.createAssignment({
          lesson: lessonId,
          title: form.title.trim(),
          description: form.content_body || '',
          max_score: 100,
        })
      }
      setLessonForms((prev) => ({ ...prev, [moduleId]: { title: '', content_type: 'html', content_body: '', external_url: '' } }))
      toast.success('Lesson added')
      onRefresh()
    } catch {
      toast.error('Failed to add lesson')
    }
  }

  const togglePublish = async () => {
    setPublishing(true)
    try {
      await learningAPI.updateOffering(offering.id, {
        is_published: !offering.is_published,
        enrollment_open: true,
      })
      toast.success(offering.is_published ? 'Offering unpublished' : 'Offering published for students')
      onRefresh()
    } catch {
      toast.error('Failed to update offering')
    } finally {
      setPublishing(false)
    }
  }

  const updateLessonForm = (moduleId: number, patch: Partial<(typeof lessonForms)[number]>) => {
    setLessonForms((prev) => ({
      ...prev,
      [moduleId]: { title: '', content_type: 'html', content_body: '', external_url: '', ...prev[moduleId], ...patch },
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/50 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Publishing</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {offering.is_published
              ? 'Students can see and enroll in this offering'
              : 'Draft — not visible to students until published'}
          </p>
        </div>
        <button
          type="button"
          onClick={togglePublish}
          disabled={publishing}
          className={cn(
            'px-4 h-10 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2',
            offering.is_published
              ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          )}
        >
          {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
          {offering.is_published ? 'Unpublish' : 'Publish offering'}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Add module</h3>
        <div className="flex gap-2">
          <input
            value={moduleTitle}
            onChange={(e) => setModuleTitle(e.target.value)}
            placeholder="Module title (e.g. Week 1 — Introduction)"
            className="flex-1 h-10 px-3 rounded-xl border border-slate-200 text-sm"
          />
          <button
            type="button"
            onClick={addModule}
            disabled={savingModule}
            className="px-4 h-10 rounded-xl bg-slate-900 text-white text-sm font-medium flex items-center gap-1.5"
          >
            {savingModule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
      </div>

      {modules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          Add your first module, then add lessons (video, PDF, quiz, assignment).
        </div>
      ) : (
        modules.map((mod: Module) => (
          <div key={mod.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedModule(expandedModule === mod.id ? null : mod.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 text-left"
            >
              <div>
                <span className="font-semibold text-slate-800">{mod.title}</span>
                <span className="text-xs text-slate-400 ml-2">{mod.lesson_count ?? mod.lessons?.length ?? 0} lessons</span>
              </div>
              {expandedModule === mod.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {expandedModule === mod.id && (
              <div className="px-5 pb-5 border-t border-slate-100 space-y-4">
                <ul className="divide-y divide-slate-50">
                  {(mod.lessons ?? []).map((lesson: Lesson) => (
                    <li key={lesson.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-sm text-slate-800">{lesson.title}</span>
                        <Badge variant="neutral" className="ml-2">{lesson.content_type}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">New lesson</p>
                  <input
                    value={lessonForms[mod.id]?.title ?? ''}
                    onChange={(e) => updateLessonForm(mod.id, { title: e.target.value })}
                    placeholder="Lesson title"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                  />
                  <select
                    value={lessonForms[mod.id]?.content_type ?? 'html'}
                    onChange={(e) => updateLessonForm(mod.id, { content_type: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                  >
                    {CONTENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {(lessonForms[mod.id]?.content_type === 'html') && (
                    <textarea
                      value={lessonForms[mod.id]?.content_body ?? ''}
                      onChange={(e) => updateLessonForm(mod.id, { content_body: e.target.value })}
                      placeholder="HTML or text content…"
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                    />
                  )}
                  {(['video', 'pdf', 'link'].includes(lessonForms[mod.id]?.content_type ?? '')) && (
                    <input
                      value={lessonForms[mod.id]?.external_url ?? ''}
                      onChange={(e) => updateLessonForm(mod.id, { external_url: e.target.value })}
                      placeholder="URL (YouTube, PDF link, etc.)"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => addLesson(mod.id)}
                    className="px-4 h-9 rounded-lg bg-brand-600 text-white text-sm font-medium flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add lesson
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
