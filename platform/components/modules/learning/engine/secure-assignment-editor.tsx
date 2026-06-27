'use client'

import { useEffect, useState, useRef } from 'react'
import { Loader2, Lock, Send, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { LButton } from '../learning-ui'
import { useSecureInput, secureInputProps } from './use-secure-input'
import type { Assignment, Submission } from '@/lib/types'

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
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [wordCount, setWordCount] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useSecureInput(!submission)

  useEffect(() => {
    learningAPI.getMySubmission(assignment.id)
      .then((resp) => {
        if (resp.data.submitted && resp.data.submission) {
          setSubmission(resp.data.submission)
        } else {
          const saved = localStorage.getItem(draftKey)
          if (saved) setContent(saved)
        }
      })
      .finally(() => setLoading(false))
  }, [assignment.id, draftKey])

  useEffect(() => {
    if (!submission) {
      localStorage.setItem(draftKey, content)
      setWordCount(content.trim() ? content.trim().split(/\s+/).length : 0)
    }
  }, [content, draftKey, submission])

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error('Write your answer before submitting')
      return
    }
    setSubmitting(true)
    try {
      await learningAPI.submitAssignment(assignment.id, { content: content.trim() })
      if (lessonId) await learningAPI.markLessonComplete(lessonId)
      localStorage.removeItem(draftKey)
      toast.success('Assignment submitted — awaiting grade')
      const resp = await learningAPI.getMySubmission(assignment.id)
      if (resp.data.submission) setSubmission(resp.data.submission)
      onSubmitted?.()
    } catch {
      toast.error('Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" /></div>
  }

  if (submission) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white overflow-hidden">
        <div className="px-6 py-4 border-b border-emerald-100 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span className="font-semibold text-emerald-900">Submitted & locked</span>
        </div>
        <div className="p-6 prose prose-slate max-w-none">
          <p className="whitespace-pre-wrap text-slate-800 leading-relaxed">{submission.content}</p>
        </div>
        {submission.score != null && (
          <div className="px-6 py-4 bg-white border-t border-emerald-100">
            <p className="text-lg font-semibold text-slate-900">
              Score: {submission.score} / {assignment.max_score}
              <span className="text-sm font-normal text-slate-500 ml-2">
                ({Math.round(Number(submission.score) / assignment.max_score * 100)}%)
              </span>
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

  const secure = secureInputProps(true)

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{assignment.title}</p>
          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Secure writing · paste disabled · auto-save
          </p>
        </div>
        <span className="text-xs text-slate-400 tabular-nums">{wordCount} words</span>
      </div>
      {assignment.description && (
        <div className="px-5 py-3 text-sm text-slate-600 border-b border-slate-50 bg-brand-50/30">
          {assignment.description}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        {...secure}
        rows={16}
        placeholder="Type your answer here. Only manual typing is allowed in this workspace."
        className="w-full px-6 py-5 text-[15px] leading-[1.75] text-slate-800 resize-none focus:outline-none min-h-[400px] font-[Georgia,serif]"
      />
      <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
        <LButton onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Submit assignment
        </LButton>
      </div>
    </div>
  )
}
