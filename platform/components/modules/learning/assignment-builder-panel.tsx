'use client'

import { useEffect, useState } from 'react'
import {
  Calendar, Check, FileUp, Link2, Loader2, Sparkles, Type,
} from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { LButton } from './learning-ui'
import type { Assignment, Lesson } from '@/lib/types'

type AssignmentType = 'essay' | 'short_answer' | 'file_upload'

interface ResourceAttachment {
  label: string
  url: string
  file_type: string
}

const FILE_TYPE_OPTIONS = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'txt', 'zip']

interface AssignmentBuilderPanelProps {
  lesson: Lesson
  assignment: Assignment
  onRefresh: () => void
}

export function AssignmentBuilderPanel({
  lesson,
  assignment,
  onRefresh,
}: AssignmentBuilderPanelProps) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    stepTitle: lesson.title,
    title: assignment.title,
    assignment_type: (assignment.assignment_type || 'essay') as AssignmentType,
    description: assignment.description || '',
    rubric: assignment.rubric || '',
    max_score: assignment.max_score ?? 100,
    due_at: assignment.due_at ? assignment.due_at.slice(0, 16) : '',
    enable_ai_grading: assignment.enable_ai_grading ?? false,
    allow_resubmission: assignment.allow_resubmission ?? false,
    allow_late_submission: assignment.allow_late_submission ?? false,
    similarity_check_enabled: assignment.similarity_check_enabled ?? true,
    allowed_file_types: assignment.allowed_file_types?.length
      ? assignment.allowed_file_types
      : ['pdf', 'docx'],
    max_file_size_mb: assignment.max_file_size_mb ?? 10,
    allow_multiple_files: assignment.allow_multiple_files ?? false,
    resource_attachments: (assignment.resource_attachments || []) as ResourceAttachment[],
  })
  const [newAttachment, setNewAttachment] = useState({ label: '', url: '', file_type: 'link' })

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      stepTitle: lesson.title,
      title: assignment.title,
      assignment_type: (assignment.assignment_type || 'essay') as AssignmentType,
      description: assignment.description || '',
      rubric: assignment.rubric || '',
      max_score: assignment.max_score ?? 100,
      due_at: assignment.due_at ? assignment.due_at.slice(0, 16) : '',
      enable_ai_grading: assignment.enable_ai_grading ?? false,
      allow_resubmission: assignment.allow_resubmission ?? false,
      allow_late_submission: assignment.allow_late_submission ?? false,
      similarity_check_enabled: assignment.similarity_check_enabled ?? true,
      allowed_file_types: assignment.allowed_file_types?.length
        ? assignment.allowed_file_types
        : ['pdf', 'docx'],
      max_file_size_mb: assignment.max_file_size_mb ?? 10,
      allow_multiple_files: assignment.allow_multiple_files ?? false,
      resource_attachments: (assignment.resource_attachments || []) as ResourceAttachment[],
    }))
  }, [assignment, lesson.title])

  const save = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Assignment title and question/instructions are required')
      return
    }
    setSaving(true)
    try {
      await learningAPI.updateLesson(lesson.id, { title: form.stepTitle.trim() })
      await learningAPI.updateAssignment(assignment.id, {
        title: form.title.trim(),
        description: form.description.trim(),
        rubric: form.rubric.trim(),
        max_score: form.max_score,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        assignment_type: form.assignment_type,
        enable_ai_grading: form.enable_ai_grading,
        allow_resubmission: form.allow_resubmission,
        allow_late_submission: form.allow_late_submission,
        similarity_check_enabled: form.similarity_check_enabled,
        resource_attachments: form.resource_attachments,
        allowed_file_types: form.assignment_type === 'file_upload' ? form.allowed_file_types : [],
        max_file_size_mb: form.max_file_size_mb,
        allow_multiple_files: form.allow_multiple_files,
      })
      toast.success('Assignment saved')
      onRefresh()
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const addAttachment = () => {
    if (!newAttachment.url.trim()) return
    setForm((f) => ({
      ...f,
      resource_attachments: [
        ...f.resource_attachments,
        {
          label: newAttachment.label.trim() || 'Resource',
          url: newAttachment.url.trim(),
          file_type: newAttachment.file_type,
        },
      ],
    }))
    setNewAttachment({ label: '', url: '', file_type: 'link' })
  }

  const isTextType = form.assignment_type === 'essay' || form.assignment_type === 'short_answer'

  return (
    <div className="space-y-5 rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/40 to-white p-5">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
          <Type className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Assignment builder</p>
          <p className="text-xs text-slate-500">University-level assessment with rubric, deadline, and AI grading</p>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-600">Step title (on learning path)</label>
        <input
          value={form.stepTitle}
          onChange={(e) => setForm({ ...form, stepTitle: e.target.value })}
          className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-600 mb-2 block">Assignment type</label>
        <div className="flex flex-wrap gap-2">
          {([
            ['essay', 'Essay'],
            ['short_answer', 'Short Answer'],
            ['file_upload', 'File Upload'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setForm({ ...form, assignment_type: val })}
              className={`text-xs px-3 py-2 rounded-xl border font-medium transition-colors ${
                form.assignment_type === val
                  ? 'bg-brand-700 text-white border-brand-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-brand-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-600">Assignment title</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Deadline
          </label>
          <input
            type="datetime-local"
            value={form.due_at}
            onChange={(e) => setForm({ ...form, due_at: e.target.value })}
            className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-600">
          {isTextType ? 'Question / instructions' : 'Upload instructions'}
        </label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={5}
          className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white leading-relaxed"
          placeholder="What should students do? Include formatting, word count, and submission rules."
        />
      </div>

      {isTextType && (
        <div>
          <label className="text-xs font-semibold text-slate-600">Marking rubric</label>
          <textarea
            value={form.rubric}
            onChange={(e) => setForm({ ...form, rubric: e.target.value })}
            rows={4}
            placeholder="Criteria for excellent, good, fair, and poor work — used by AI and manual grading."
            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white leading-relaxed"
          />
        </div>
      )}

      <div className="w-36">
        <label className="text-xs font-semibold text-slate-600">Maximum score</label>
        <input
          type="number"
          min={1}
          value={form.max_score}
          onChange={(e) => setForm({ ...form, max_score: Number(e.target.value) })}
          className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
        />
      </div>

      {form.assignment_type === 'file_upload' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
            <FileUp className="w-3.5 h-3.5" /> File upload settings
          </p>
          <div className="flex flex-wrap gap-2">
            {FILE_TYPE_OPTIONS.map((t) => (
              <label key={t} className="inline-flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={form.allowed_file_types.includes(t)}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      allowed_file_types: e.target.checked
                        ? [...f.allowed_file_types, t]
                        : f.allowed_file_types.filter((x) => x !== t),
                    }))
                  }}
                />
                {t.toUpperCase()}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <label className="text-xs text-slate-600">
              Max size (MB)
              <input
                type="number"
                min={1}
                max={50}
                value={form.max_file_size_mb}
                onChange={(e) => setForm({ ...form, max_file_size_mb: Number(e.target.value) })}
                className="ml-2 w-16 h-8 px-2 rounded border border-slate-200"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.allow_multiple_files}
                onChange={(e) => setForm({ ...form, allow_multiple_files: e.target.checked })}
              />
              Allow multiple files
            </label>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
          <Link2 className="w-3.5 h-3.5" /> Lecturer attachments (PDF, video links, resources)
        </p>
        {form.resource_attachments.map((att, i) => (
          <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2">
            <span className="font-medium text-slate-700">{att.label}</span>
            <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 truncate flex-1">
              {att.url}
            </a>
            <button
              type="button"
              className="text-red-500"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  resource_attachments: f.resource_attachments.filter((_, j) => j !== i),
                }))
              }
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={newAttachment.label}
            onChange={(e) => setNewAttachment({ ...newAttachment, label: e.target.value })}
            placeholder="Label"
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm flex-1"
          />
          <input
            value={newAttachment.url}
            onChange={(e) => setNewAttachment({ ...newAttachment, url: e.target.value })}
            placeholder="https://… or resource URL"
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm flex-[2]"
          />
          <LButton size="sm" variant="secondary" onClick={addAttachment}>Add</LButton>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <ToggleRow
          label="Enable AI grading"
          hint="Sends rubric + context to AI — lecturer approves final score"
          icon={Sparkles}
          checked={form.enable_ai_grading}
          onChange={(v) => setForm({ ...form, enable_ai_grading: v })}
        />
        <ToggleRow
          label="Allow resubmission"
          hint="Students can submit again before grading"
          checked={form.allow_resubmission}
          onChange={(v) => setForm({ ...form, allow_resubmission: v })}
        />
        <ToggleRow
          label="Allow late submission"
          hint="Accept submissions after deadline"
          checked={form.allow_late_submission}
          onChange={(v) => setForm({ ...form, allow_late_submission: v })}
        />
        <ToggleRow
          label="Plagiarism check"
          hint="Similarity detection on text submissions"
          checked={form.similarity_check_enabled}
          onChange={(v) => setForm({ ...form, similarity_check_enabled: v })}
        />
      </div>

      <LButton size="sm" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Save assignment
      </LButton>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  icon: Icon,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 cursor-pointer hover:bg-white transition-colors">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1" />
      <div>
        <p className="font-medium text-slate-800 flex items-center gap-1">
          {Icon && <Icon className="w-3.5 h-3.5 text-brand-600" />}
          {label}
        </p>
        {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
      </div>
    </label>
  )
}
