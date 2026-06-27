'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { LButton } from './learning-ui'
import type { Assignment, Submission } from '@/lib/types'

export function AssignmentPanel({
  assignment,
  lessonId,
  onSubmitted,
}: {
  assignment: Assignment
  lessonId?: number
  onSubmitted?: () => void
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState<Submission | null>(null)

  useEffect(() => {
    learningAPI.getMySubmission(assignment.id)
      .then((resp) => {
        if (resp.data.submitted && resp.data.submission) {
          setSubmission(resp.data.submission)
        }
      })
      .finally(() => setLoading(false))
  }, [assignment.id])

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error('Write your response before submitting')
      return
    }
    setSubmitting(true)
    try {
      await learningAPI.submitAssignment(assignment.id, { content: content.trim() })
      if (lessonId) {
        await learningAPI.markLessonComplete(lessonId)
      }
      toast.success('Submitted — next step unlocked')
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
    return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" /></div>
  }

  if (submission) {
    return (
      <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-white p-6">
        <div className="flex items-center gap-2 text-emerald-800 font-semibold mb-4">
          <CheckCircle2 className="w-5 h-5" /> Assignment submitted
        </div>
        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{submission.content}</p>
        {submission.score != null && (
          <p className="text-sm font-semibold text-slate-800 mt-4 pt-4 border-t border-emerald-100">
            Score: {submission.score} / {assignment.max_score}
          </p>
        )}
        {submission.feedback && (
          <div className="mt-3 rounded-xl bg-white p-4 border border-emerald-100 text-sm text-slate-600">
            <span className="font-medium text-slate-800">Instructor feedback</span>
            <p className="mt-1">{submission.feedback}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {assignment.description && (
        <p className="text-sm text-slate-600 leading-relaxed">{assignment.description}</p>
      )}
      {assignment.due_at && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-4 py-2.5 border border-amber-100">
          Due {new Date(assignment.due_at).toLocaleString()}
        </p>
      )}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
        placeholder="Write your assignment response here…"
        className="w-full rounded-xl border border-slate-200 p-4 text-sm leading-relaxed focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 resize-y min-h-[200px]"
      />
      <LButton onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Submit assignment
      </LButton>
    </div>
  )
}
