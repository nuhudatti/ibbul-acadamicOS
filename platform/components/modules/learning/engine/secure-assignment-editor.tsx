'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Loader2, Lock, Send, CheckCircle2, Calendar, FileUp, Link2, Upload, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { getLearningApiError } from '@/lib/learning-utils'
import { LButton } from '../learning-ui'
import { useSecureInput, secureInputProps } from './use-secure-input'
import { formatDateTime } from '@/lib/utils'
import type { Assignment, Submission } from '@/lib/types'

function acceptFromTypes(types: string[] | undefined): string {
  if (!types?.length) return '.pdf,.doc,.docx,.ppt,.pptx,.zip,.png,.jpg,.jpeg'
  return types.map((t) => (t.startsWith('.') ? t : `.${t}`)).join(',')
}

export function SecureAssignmentEditor({
  assignment,
  lessonId,
  onSubmitted,
}: {
  assignment: Assignment
  lessonId?: number
  onSubmitted?: () => void
}) {
  const draftKey = `lms_assignment_draft_${assignment.id}`
  const isFileUpload = assignment.assignment_type === 'file_upload'
  const isShortAnswer = assignment.assignment_type === 'short_answer'
  const canResubmit = assignment.allow_resubmission

  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [wordCount, setWordCount] = useState(0)
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; key: string }[]>([])
  const [editing, setEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const locked = Boolean(submission && !canResubmit && !editing)

  useSecureInput(!locked && !isFileUpload)

  useEffect(() => {
    learningAPI.getMySubmission(assignment.id)
      .then((resp) => {
        if (resp.data.submitted && resp.data.submission) {
          setSubmission(resp.data.submission)
          if (resp.data.submission.file_key) {
            const keys = resp.data.submission.file_key.split(',').filter(Boolean)
            setUploadedFiles(keys.map((k: string, i: number) => ({ name: `File ${i + 1}`, key: k })))
          }
        } else {
          const saved = localStorage.getItem(draftKey)
          if (saved) setContent(saved)
        }
      })
      .finally(() => setLoading(false))
  }, [assignment.id, draftKey])

  useEffect(() => {
    if (!submission || editing) {
      localStorage.setItem(draftKey, content)
      setWordCount(content.trim() ? content.trim().split(/\s+/).length : 0)
    }
  }, [content, draftKey, submission, editing])

  const handleFilePick = async (files: FileList | null) => {
    if (!files?.length) return
    const maxMb = assignment.max_file_size_mb ?? 10
    const list = Array.from(files)
    if (!assignment.allow_multiple_files && list.length > 1) {
      toast.error('Only one file is allowed for this assignment')
      return
    }
    for (const file of list) {
      if (file.size > maxMb * 1024 * 1024) {
        toast.error(`${file.name} exceeds ${maxMb} MB limit`)
        return
      }
    }
    setUploading(true)
    try {
      const uploaded: { name: string; key: string }[] = []
      for (const file of list) {
        const resp = await learningAPI.uploadAssignmentSubmission(assignment.id, file)
        uploaded.push({ name: resp.data.filename || file.name, key: resp.data.file_key })
      }
      setUploadedFiles((prev) =>
        assignment.allow_multiple_files ? [...prev, ...uploaded] : uploaded
      )
      toast.success('File uploaded')
    } catch (err) {
      toast.error(getLearningApiError(err, 'Upload failed'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async () => {
    if (isFileUpload) {
      if (uploadedFiles.length === 0) {
        toast.error('Upload at least one file before submitting')
        return
      }
    } else if (!content.trim()) {
      toast.error('Write your answer before submitting')
      return
    }

    setSubmitting(true)
    try {
      await learningAPI.submitAssignment(assignment.id, {
        content: isFileUpload ? uploadedFiles.map((f) => f.name).join(', ') : content.trim(),
        file_key: uploadedFiles.map((f) => f.key).join(','),
      })
      if (lessonId) await learningAPI.markLessonComplete(lessonId)
      localStorage.removeItem(draftKey)
      toast.success(canResubmit && submission ? 'Assignment resubmitted' : 'Assignment submitted — awaiting grade')
      const resp = await learningAPI.getMySubmission(assignment.id)
      if (resp.data.submission) {
        setSubmission(resp.data.submission)
        setEditing(false)
      }
      onSubmitted?.()
    } catch (err) {
      toast.error(getLearningApiError(err, 'Submit failed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" /></div>
  }

  if (submission && !editing && !canResubmit) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white overflow-hidden">
        <div className="px-6 py-4 border-b border-emerald-100 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span className="font-semibold text-emerald-900">Submitted & locked</span>
        </div>
        <div className="p-6 prose prose-slate max-w-none">
          {submission.content && (
            <p className="whitespace-pre-wrap text-slate-800 leading-relaxed">{submission.content}</p>
          )}
          {submission.file_key && (
            <p className="text-sm text-brand-700 mt-2 break-all">{submission.file_key}</p>
          )}
        </div>
        {submission.score != null && (
          <div className="px-6 py-4 bg-white border-t border-emerald-100">
            <p className="text-lg font-semibold text-slate-900">
              Score: {submission.score} / {assignment.max_score}
            </p>
            {submission.feedback && (
              <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Instructor feedback</span>
                <p className="mt-1">{submission.feedback}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (submission && !editing && canResubmit) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/30 overflow-hidden">
        <div className="px-6 py-4 border-b border-amber-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-amber-600" />
            <span className="font-semibold text-amber-900">Submitted — resubmission allowed</span>
          </div>
          <LButton size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit & resubmit
          </LButton>
        </div>
        <div className="p-6 text-sm text-slate-700">
          {submission.content || submission.file_key || 'Your previous submission is on record.'}
        </div>
      </div>
    )
  }

  const secure = secureInputProps(true)
  const resources = assignment.resource_attachments ?? []

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      <div className="px-5 py-4 bg-slate-50 border-b border-slate-100">
        <p className="text-base font-semibold text-slate-900">{assignment.title}</p>
        <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-slate-500">
          {!isFileUpload && (
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3" /> Secure writing · paste disabled
            </span>
          )}
          {assignment.due_at && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Due {formatDateTime(assignment.due_at)}
              {!assignment.allow_late_submission && ' · Late submissions closed after deadline'}
            </span>
          )}
          <span>Max score: {assignment.max_score}</span>
        </div>
      </div>

      {(assignment.description || assignment.rubric) && (
        <div className="px-5 py-4 text-sm text-slate-700 border-b border-slate-50 space-y-3">
          {assignment.description && (
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Instructions</p>
              <p className="whitespace-pre-wrap leading-relaxed">{assignment.description}</p>
            </div>
          )}
          {assignment.rubric && (
            <div className="rounded-lg bg-brand-50/40 border border-brand-100 p-3">
              <p className="text-[10px] font-semibold uppercase text-brand-700 mb-1">Marking rubric</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{assignment.rubric}</p>
            </div>
          )}
        </div>
      )}

      {resources.length > 0 && (
        <div className="px-5 py-3 border-b border-slate-50 bg-white">
          <p className="text-[10px] font-semibold uppercase text-slate-400 mb-2">Resources</p>
          <ul className="space-y-1.5">
            {resources.map((r, i) => (
              <li key={i}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-brand-700 hover:underline inline-flex items-center gap-1.5"
                >
                  {r.file_type === 'link' ? <Link2 className="w-3.5 h-3.5" /> : <FileUp className="w-3.5 h-3.5" />}
                  {r.label || r.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isFileUpload ? (
        <div className="p-6 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptFromTypes(assignment.allowed_file_types)}
            multiple={assignment.allow_multiple_files}
            className="hidden"
            onChange={(e) => handleFilePick(e.target.files)}
          />
          <div
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-brand-300 transition-colors cursor-pointer"
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="w-8 h-8 animate-spin text-brand-600 mx-auto" />
            ) : (
              <Upload className="w-8 h-8 text-slate-400 mx-auto" />
            )}
            <p className="mt-3 text-sm font-medium text-slate-700">
              {assignment.allow_multiple_files ? 'Upload files' : 'Upload your file'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Allowed: {(assignment.allowed_file_types?.length ? assignment.allowed_file_types.join(', ') : 'PDF, DOCX, PPT, images, ZIP')}
              · Max {assignment.max_file_size_mb ?? 10} MB
            </p>
          </div>
          {uploadedFiles.length > 0 && (
            <ul className="space-y-2">
              {uploadedFiles.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                  <FileUp className="w-4 h-4 text-brand-600 shrink-0" />
                  <span className="truncate flex-1">{f.name}</span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-500"
                    onClick={() => setUploadedFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="px-5 py-2 border-b border-slate-50 flex justify-end">
            <span className="text-xs text-slate-400 tabular-nums">{wordCount} words</span>
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            {...secure}
            rows={isShortAnswer ? 8 : 16}
            placeholder={
              isShortAnswer
                ? 'Type your concise answer here.'
                : 'Type your essay here. Only manual typing is allowed in this workspace.'
            }
            className="w-full px-6 py-5 text-[15px] leading-[1.75] text-slate-800 resize-none focus:outline-none min-h-[280px] font-[Georgia,serif]"
          />
        </>
      )}

      <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
        {editing && (
          <LButton variant="secondary" onClick={() => setEditing(false)} disabled={submitting}>
            Cancel
          </LButton>
        )}
        <LButton onClick={handleSubmit} disabled={submitting || uploading}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {editing || (submission && canResubmit) ? 'Resubmit assignment' : 'Submit assignment'}
        </LButton>
      </div>
    </div>
  )
}
